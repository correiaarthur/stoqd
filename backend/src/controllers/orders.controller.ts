import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { getActivePrice } from '../lib/pricing.js';
import { parseCartItems, parseCartToken } from '../lib/cartItems.js';
import {
  MAX_LINES_PER_CART,
  MAX_UNITS_PER_CART,
  getStockView,
  reservationExpiry,
  IDENTIFIED_RESERVATION_MINUTES,
} from '../lib/availability.js';
import { SaleError, registerSale } from '../lib/sales.js';
import { notifyNewOrder } from '../lib/notifications.js';
import { checkCoupon, couponDiscountFor } from '../lib/coupons.js';
import { computeTotals, getInterestPercent, previewInstallmentValue } from '../lib/pricingRules.js';

/** Um pedido pendente por vez já é bastante para quem atende sozinha. */
const MAX_PENDING_ORDERS_PER_USER = 3;

class OrderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof OrderError) return res.status(error.status).json({ error: error.message });
  if (error instanceof SaleError) return res.status(400).json({ error: error.message });

  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

/**
 * Cria o pedido a partir do carrinho e dispara o aviso.
 *
 * Nenhum estoque baixa aqui: o pedido nasce PENDING e só vira venda quando o
 * admin confirma. As reservas do carrinho passam a apontar para o pedido —
 * ficam presas a ele, e só saem quando o pedido virar venda ou for recusado.
 */
export async function create(req: Request, res: Response) {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "Faça login para enviar o pedido." });

  const cartToken = parseCartToken(req.body?.cartToken);
  const parsed = parseCartItems(req.body?.items, { maxLines: MAX_LINES_PER_CART, maxUnits: MAX_UNITS_PER_CART });
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const observation = req.body?.observation ? String(req.body.observation).trim().slice(0, 500) : null;

  // Preferência, não decisão: o cliente diz como quer pagar e a loja confirma.
  const paymentType = req.body?.paymentType === 'PRAZO' ? 'PRAZO' : 'VISTA';
  const requestedInstallments = paymentType === 'PRAZO' ? Number(req.body?.installmentsCount) || 1 : 1;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const pendingCount = await tx.order.count({ where: { userId, status: 'PENDING' } });

      if (pendingCount >= MAX_PENDING_ORDERS_PER_USER) {
        throw new OrderError(
          "Você já tem pedidos aguardando confirmação. Espere a resposta antes de enviar outro.",
          429
        );
      }

      const products = await tx.product.findMany({
        where: { id: { in: parsed.items.map(item => item.productId) } },
        select: { id: true, name: true, quantity: true, sellingPrice: true, promotionalPrice: true },
      });
      const productById = new Map(products.map(product => [product.id, product]));

      // A reserva do próprio carrinho não conta contra ele — mas o que outra
      // pessoa reservou, sim.
      const stock = await getStockView(products, { tx, ...(cartToken ? { excludeCartToken: cartToken } : {}) });

      const itemsData = [];

      for (const item of parsed.items) {
        const product = productById.get(item.productId);
        if (!product) throw new OrderError("Um dos produtos do carrinho não existe mais.");

        const available = stock.get(product.id)?.available ?? 0;

        if (available < item.quantity) {
          throw new OrderError(
            available === 0
              ? `${product.name} esgotou enquanto você finalizava. Remova o item para continuar.`
              : `Restam ${available} de ${item.quantity} unidades de ${product.name}. Ajuste a quantidade para continuar.`
          );
        }

        itemsData.push({
          productId: product.id,
          quantity: item.quantity,
          // Congela o preço que a pessoa viu. Quem decide o valor cobrado
          // ainda é a venda, na confirmação — mas com o preço do pedido à vista.
          unitPrice: getActivePrice(product),
        });
      }

      // A opção de parcelamento é conferida no banco: uma que a loja desligou
      // não pode chegar até a confirmação como se estivesse valendo.
      if (paymentType === 'PRAZO' && await getInterestPercent(tx, requestedInstallments) === null) {
        throw new OrderError(`O parcelamento em ${requestedInstallments}x não está disponível.`);
      }

      const subtotal = itemsData.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

      // O cupom é conferido agora só para o pedido não nascer com um código
      // que já não vale. Quem gasta o uso é a venda, na confirmação — um
      // pedido pendente ainda não consumiu nada, e um recusado não pode.
      let couponId: number | null = null;

      if (req.body?.couponCode) {
        const coupon = await checkCoupon(tx, req.body.couponCode, subtotal);
        if (!coupon.ok) throw new OrderError(coupon.message);
        couponId = coupon.couponId;
      }

      const created = await tx.order.create({
        data: {
          userId,
          observation,
          paymentType,
          installmentsCount: requestedInstallments,
          couponId,
          items: { create: itemsData },
        },
        include: {
          items: { include: { product: { select: { name: true } } } },
          user: { select: { name: true, phone: true, email: true } },
        },
      });

      // As reservas do carrinho passam a pertencer ao pedido.
      if (cartToken) {
        await tx.reservation.updateMany({
          where: { cartToken, orderId: null },
          data: { orderId: created.id, expiresAt: reservationExpiry(IDENTIFIED_RESERVATION_MINUTES) },
        });
      }

      return created;
    });

    const total = order.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

    // Depois do commit e sem await: o pedido já existe, e o aviso não pode
    // atrasar nem derrubar a resposta.
    void notifyNewOrder({
      orderId: order.id,
      customerName: order.user.name,
      customerPhone: order.user.phone,
      customerEmail: order.user.email,
      total,
      items: order.items.map(item => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });

    return res.status(201).json({ id: order.id, status: order.status, total });
  } catch (error) {
    return fail(res, error, "Não foi possível enviar o pedido. Tente novamente.");
  }
}

/**
 * Pedidos para a tela de Vendas. Cada item vem com o preço do pedido e o preço
 * de hoje: se mudaram no intervalo, a tela mostra os dois e você escolhe qual
 * cobrar — senão o cliente vê um valor e paga outro.
 */
export async function list(req: Request, res: Response) {
  const status = String(req.query.status ?? 'PENDING').toUpperCase();

  if (!['PENDING', 'CONFIRMED', 'CANCELLED', 'ALL'].includes(status)) {
    return res.status(400).json({ error: "Situação inválida." });
  }

  try {
    const orders = await prisma.order.findMany({
      where: status === 'ALL' ? {} : { status: status as 'PENDING' | 'CONFIRMED' | 'CANCELLED' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true, name: true, phone: true, email: true,
            customer: { select: { id: true, name: true } },
          },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, quantity: true, sellingPrice: true, promotionalPrice: true },
            },
          },
        },
        coupon: true,
      },
    });

    const allProducts = orders.flatMap(order => order.items.map(item => item.product));
    const stock = await getStockView(allProducts);

    const plans = await prisma.installmentPlan.findMany({ where: { active: true } });
    const planRates = new Map(plans.map(plan => [plan.installments, plan.interestPercent]));

    // Um Customer com o mesmo telefone ou e-mail é a pista para sugerir o
    // vínculo. A decisão continua sendo sua: o sistema não funde ninguém sozinho.
    const contacts = orders
      .filter(order => !order.user.customer)
      .flatMap(order => [order.user.phone, order.user.email])
      .filter((contact): contact is string => Boolean(contact));

    const candidates = contacts.length > 0
      ? await prisma.customer.findMany({
          where: { OR: [{ phone: { in: contacts } }, { email: { in: contacts } }] },
          select: { id: true, name: true, phone: true, email: true },
        })
      : [];

    const payload = orders.map(order => {
      const items = order.items.map(item => {
        const currentPrice = getActivePrice(item.product);
        const available = stock.get(item.productId)?.available ?? 0;

        return {
          productId: item.productId,
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          currentPrice,
          priceChanged: Math.abs(currentPrice - item.unitPrice) > 0.005,
          quantityInStock: item.product.quantity,
          available,
          hasStock: item.product.quantity >= item.quantity,
        };
      });

      const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

      // O que o cliente pediu, já com as contas feitas — para a tela de
      // confirmação abrir preenchida em vez de fazer a loja recalcular.
      const couponDiscount = order.coupon ? couponDiscountFor(order.coupon, subtotal) : 0;
      const interestPercent = order.paymentType === 'PRAZO'
        ? planRates.get(order.installmentsCount) ?? null
        : 0;

      const requestedTotals = computeTotals({
        grossTotal: subtotal,
        discount: couponDiscount,
        interestPercent: interestPercent ?? 0,
      });

      return {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        observation: order.observation,
        cancelReason: order.cancelReason,
        saleId: order.saleId,
        requested: {
          paymentType: order.paymentType,
          installmentsCount: order.installmentsCount,
          // Null quando a loja desligou aquele parcelamento depois do pedido:
          // a tela precisa avisar em vez de cobrar juros que não existem mais.
          interestPercent,
          coupon: order.coupon
            ? { id: order.coupon.id, code: order.coupon.code, discount: couponDiscount }
            : null,
          subtotal: requestedTotals.grossTotal,
          discount: requestedTotals.discount,
          interest: requestedTotals.interest,
          total: requestedTotals.finalTotal,
          installmentValue: order.installmentsCount > 1
            ? previewInstallmentValue(requestedTotals.finalTotal, order.installmentsCount)
            : requestedTotals.finalTotal,
        },
        user: {
          id: order.user.id,
          name: order.user.name,
          phone: order.user.phone,
          email: order.user.email,
          customer: order.user.customer,
        },
        // Telefone e e-mail iguais são a pista para sugerir o vínculo. Conta
        // sem e-mail casa só pelo telefone — comparar dois nulos não pode
        // sugerir que duas pessoas sem e-mail são a mesma.
        suggestedCustomers: order.user.customer
          ? []
          : candidates.filter(candidate =>
              (candidate.phone !== null && candidate.phone === order.user.phone) ||
              (candidate.email !== null && order.user.email !== null && candidate.email === order.user.email)
            ),
        items,
        total: items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
        hasStockForAll: items.every(item => item.hasStock),
      };
    });

    return res.json(payload);
  } catch (error) {
    return fail(res, error, "Erro ao buscar pedidos.");
  }
}

/**
 * Confirma o pedido: vincula ou cria o Customer, revalida o estoque e cria a
 * venda pelo mesmo caminho da venda de balcão.
 *
 * A revalidação pode recusar — e é justamente o desenho. Um pedido pendente não
 * segura estoque (decisão D2, o balcão ganha), então o item pode ter sido
 * vendido na loja no intervalo. Quando acontece, a mensagem diz qual produto e
 * quanto restou, em vez de um erro genérico.
 */
export async function confirm(req: Request, res: Response) {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: "Pedido inválido." });

  const {
    customerId,
    createCustomer = false,
    priceSource = 'order',
    discount = 0,
    installmentsCount,
    paymentType,
    observation,
    // `false` descarta o cupom que o cliente pediu; qualquer outra coisa mantém.
    keepCoupon = true,
  } = req.body ?? {};

  if (priceSource !== 'order' && priceSource !== 'current') {
    return res.status(400).json({ error: "Escolha se o pedido será cobrado pelo preço do pedido ou pelo preço de hoje." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: true } },
          user: true,
          coupon: true,
        },
      });

      if (!order) throw new OrderError("Pedido não encontrado.", 404);
      if (order.status !== 'PENDING') {
        throw new OrderError(
          order.status === 'CONFIRMED'
            ? "Este pedido já virou venda."
            : "Este pedido foi recusado e não pode ser confirmado.",
          409
        );
      }

      // O vínculo acontece aqui, e não no cadastro: é o momento em que você já
      // vai falar com a pessoa para confirmar, e o sistema não precisa adivinhar
      // sozinho que duas pessoas são a mesma.
      let linkedCustomerId: number;

      if (order.user.customerId) {
        linkedCustomerId = order.user.customerId;
      } else if (customerId) {
        const existing = await tx.customer.findUnique({ where: { id: Number(customerId) } });
        if (!existing) throw new OrderError("Cliente escolhido não existe.", 404);

        const alreadyLinked = await tx.user.findUnique({ where: { customerId: existing.id } });
        if (alreadyLinked && alreadyLinked.id !== order.userId) {
          throw new OrderError("Este cliente já está vinculado a outra conta.", 409);
        }

        linkedCustomerId = existing.id;
        await tx.user.update({ where: { id: order.userId }, data: { customerId: existing.id } });
      } else if (createCustomer) {
        const created = await tx.customer.create({
          data: { name: order.user.name, phone: order.user.phone, email: order.user.email },
        });
        linkedCustomerId = created.id;
        await tx.user.update({ where: { id: order.userId }, data: { customerId: created.id } });
      } else {
        throw new OrderError("Escolha o cliente da venda ou crie um novo a partir dos dados do pedido.");
      }

      const saleItems = order.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: priceSource === 'order' ? item.unitPrice : getActivePrice(item.product),
      }));

      // O cupom é revalidado contra o subtotal que a venda vai cobrar de fato —
      // que muda se a loja escolher o preço de hoje em vez do preço do pedido.
      let coupon: { id: number; discount: number } | null = null;

      if (keepCoupon !== false && order.couponId) {
        const subtotal = saleItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
        const checked = await checkCoupon(tx, order.coupon?.code, subtotal);

        if (!checked.ok) {
          throw new OrderError(
            `O cupom ${order.coupon?.code} não vale mais: ${checked.message.toLowerCase()} Confirme sem o cupom ou recuse o pedido.`
          );
        }

        coupon = { id: checked.couponId, discount: checked.discount };
      }

      const sale = await registerSale(tx, {
        customerId: linkedCustomerId,
        items: saleItems,
        discount: Number(discount) || 0,
        // Sem override, vale o que o cliente pediu.
        installmentsCount: installmentsCount ?? order.installmentsCount,
        paymentType: paymentType ?? order.paymentType,
        observation: observation ? String(observation).trim() : `Pedido #${order.id} pela vitrine`,
        coupon,
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CONFIRMED', saleId: sale.id },
      });

      // A reserva cumpriu o papel: virou venda, o estoque já baixou.
      await tx.reservation.deleteMany({ where: { orderId: order.id } });

      return { orderId: order.id, saleId: sale.id, customerId: linkedCustomerId, total: sale.total };
    });

    return res.json(result);
  } catch (error) {
    return fail(res, error, "Não foi possível confirmar o pedido.");
  }
}

/** Recusa o pedido, libera as reservas e guarda o motivo para o cliente ler. */
export async function cancel(req: Request, res: Response) {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: "Pedido inválido." });

  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 3) {
    return res.status(400).json({ error: "Explique o motivo da recusa — é o que o cliente vai ler." });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const found = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });

      if (!found) throw new OrderError("Pedido não encontrado.", 404);
      if (found.status !== 'PENDING') {
        throw new OrderError("Só um pedido pendente pode ser recusado.", 409);
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelReason: reason.slice(0, 300) },
      });

      // Sem isto o estoque ficaria preso a um pedido que não vai acontecer.
      await tx.reservation.deleteMany({ where: { orderId } });

      return updated;
    });

    return res.json({ id: order.id, status: order.status, cancelReason: order.cancelReason });
  } catch (error) {
    return fail(res, error, "Não foi possível recusar o pedido.");
  }
}
