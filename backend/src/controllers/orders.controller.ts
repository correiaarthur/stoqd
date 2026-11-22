import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { customerUserId } from '../middlewares/auth.js';
import { PRODUCT_STOCK_SELECT, getActivePrice } from '../lib/pricing.js';
import {
  getStockView,
  loadStockProducts,
  reservationExpiry,
  IDENTIFIED_RESERVATION_MINUTES,
} from '../lib/availability.js';
import { registerSale } from '../lib/sales.js';
import { DomainError, respondWithError } from '../lib/errors.js';
import { notifyNewOrder } from '../lib/notifications.js';
import { checkCoupon, couponDiscountFor } from '../lib/coupons.js';
import { computeTotals, getInterestPercent, previewInstallmentValue, sumLines } from '../lib/pricingRules.js';
import { parseId } from '../lib/validation.js';
import { parseOrderCancel, parseOrderConfirm, parseOrderCreate, parseOrderListQuery } from '../lib/orderInput.js';

/** Um pedido pendente por vez já é bastante para quem atende sozinha. */
const MAX_PENDING_ORDERS_PER_USER = 3;


/**
 * Cria o pedido a partir do carrinho e dispara o aviso.
 *
 * Nenhum estoque baixa aqui: o pedido nasce PENDING e só vira venda quando o
 * admin confirma. As reservas do carrinho passam a apontar para o pedido —
 * ficam presas a ele, e só saem quando o pedido virar venda ou for recusado.
 */
export async function create(req: Request, res: Response) {
  const userId = customerUserId(req);

  const parsed = parseOrderCreate(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  // Preferência, não decisão: o cliente diz como quer pagar e a loja confirma.
  const { cartToken, items: cartItems, observation, paymentType, installmentsCount: requestedInstallments, couponCode } = parsed.data;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const pendingCount = await tx.order.count({ where: { userId, status: 'PENDING' } });

      if (pendingCount >= MAX_PENDING_ORDERS_PER_USER) {
        throw new DomainError(
          "Você já tem pedidos aguardando confirmação. Espere a resposta antes de enviar outro.",
          429
        );
      }

      const { products, byId: productById } = await loadStockProducts(cartItems.map(item => item.productId), tx);

      // A reserva do próprio carrinho não conta contra ele — mas o que outra
      // pessoa reservou, sim.
      const stock = await getStockView(products, { tx, ...(cartToken ? { excludeCartToken: cartToken } : {}) });

      const itemsData = [];

      for (const item of cartItems) {
        const product = productById.get(item.productId);
        if (!product) throw new DomainError("Um dos produtos do carrinho não existe mais.");

        const available = stock.get(product.id)?.available ?? 0;

        if (available < item.quantity) {
          throw new DomainError(
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
        throw new DomainError(`O parcelamento em ${requestedInstallments}x não está disponível.`);
      }

      const subtotal = sumLines(itemsData);

      // O cupom é conferido agora só para o pedido não nascer com um código
      // que já não vale. Quem gasta o uso é a venda, na confirmação — um
      // pedido pendente ainda não consumiu nada, e um recusado não pode.
      let couponId: number | null = null;

      if (couponCode) {
        const coupon = await checkCoupon(tx, couponCode, subtotal);
        if (!coupon.ok) throw new DomainError(coupon.message);
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

    const total = sumLines(order.items);

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
    return respondWithError(res, error, "Não foi possível enviar o pedido. Tente novamente.");
  }
}

/**
 * Pedidos para a tela de Vendas. Cada item vem com o preço do pedido e o preço
 * de hoje: se mudaram no intervalo, a tela mostra os dois e você escolhe qual
 * cobrar — senão o cliente vê um valor e paga outro.
 */
export async function list(req: Request, res: Response) {
  const query = parseOrderListQuery(req.query);
  if (!query.ok) return res.status(400).json({ error: query.error });

  const { status } = query.data;

  try {
    const orders = await prisma.order.findMany({
      where: status === 'ALL' ? {} : { status },
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
              select: PRODUCT_STOCK_SELECT,
            },
          },
        },
        coupon: true,
      },
    });

    const allProducts = orders.flatMap(order => order.items.map(item => item.product));

    // Três leituras que não dependem uma da outra.
    const contacts = orders
      .filter(order => !order.user.customer)
      .flatMap(order => [order.user.phone, order.user.email])
      .filter((contact): contact is string => Boolean(contact));

    const [stock, plans, candidates] = await Promise.all([
      getStockView(allProducts),
      prisma.installmentPlan.findMany({ where: { active: true } }),
      // Um Customer com o mesmo telefone ou e-mail é a pista para sugerir o
      // vínculo. A decisão continua sendo sua: o sistema não funde ninguém sozinho.
      contacts.length > 0
        ? prisma.customer.findMany({
            where: { OR: [{ phone: { in: contacts } }, { email: { in: contacts } }] },
            select: { id: true, name: true, phone: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    const planRates = new Map(plans.map(plan => [plan.installments, plan.interestPercent]));

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

      const subtotal = sumLines(items);

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
        total: sumLines(items),
        hasStockForAll: items.every(item => item.hasStock),
      };
    });

    return res.json(payload);
  } catch (error) {
    return respondWithError(res, error, "Erro ao buscar pedidos.");
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
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(400).json({ error: "Pedido inválido." });

  const body = parseOrderConfirm(req.body);
  if (!body.ok) return res.status(400).json({ error: body.error });

  const { customerId, createCustomer, priceSource, discount, installmentsCount, paymentType, observation, keepCoupon } = body.data;

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

      if (!order) throw new DomainError("Pedido não encontrado.", 404);
      if (order.status !== 'PENDING') {
        throw new DomainError(
          order.status === 'CONFIRMED'
            ? "Este pedido já virou venda."
            : "Este pedido foi recusado e não pode ser confirmado.",
          409
        );
      }

      // Reivindica o pedido **agora**, não no fim.
      //
      // A checagem acima existe para a mensagem ser boa, mas ela não protege de
      // nada: a versão anterior só virava `CONFIRMED` depois de registrar a
      // venda, então dois cliques simultâneos passavam os dois pela checagem e
      // nasciam duas vendas para um pedido — estoque baixado duas vezes,
      // cliente cobrado em dobro. Medido: cinco confirmações simultâneas
      // geravam cinco vendas.
      //
      // Com a condição dentro do UPDATE, o Postgres tranca a linha e reavalia
      // `status = 'PENDING'` depois de a outra transação commitar. A segunda não
      // afeta linha nenhuma e desiste. Mesmo padrão do decremento de estoque em
      // `registerSale` e do `consumeCoupon`.
      const reivindicado = await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });

      if (reivindicado.count !== 1) {
        throw new DomainError("Este pedido já virou venda.", 409);
      }

      // O vínculo acontece aqui, e não no cadastro: é o momento em que você já
      // vai falar com a pessoa para confirmar, e o sistema não precisa adivinhar
      // sozinho que duas pessoas são a mesma.
      let linkedCustomerId: number;

      if (order.user.customerId) {
        linkedCustomerId = order.user.customerId;
      } else if (customerId) {
        const existing = await tx.customer.findUnique({ where: { id: customerId } });
        if (!existing) throw new DomainError("Cliente escolhido não existe.", 404);

        const alreadyLinked = await tx.user.findUnique({ where: { customerId: existing.id } });
        if (alreadyLinked && alreadyLinked.id !== order.userId) {
          throw new DomainError("Este cliente já está vinculado a outra conta.", 409);
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
        throw new DomainError("Escolha o cliente da venda ou crie um novo a partir dos dados do pedido.");
      }

      const saleItems = order.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: priceSource === 'order' ? item.unitPrice : getActivePrice(item.product),
      }));

      // O cupom é revalidado contra o subtotal que a venda vai cobrar de fato —
      // que muda se a loja escolher o preço de hoje em vez do preço do pedido.
      let coupon: { id: number; discount: number } | null = null;

      if (keepCoupon && order.couponId) {
        const subtotal = sumLines(saleItems);
        const checked = await checkCoupon(tx, order.coupon?.code, subtotal);

        if (!checked.ok) {
          throw new DomainError(
            `O cupom ${order.coupon?.code} não vale mais: ${checked.message.toLowerCase()} Confirme sem o cupom ou recuse o pedido.`
          );
        }

        coupon = { id: checked.couponId, discount: checked.discount };
      }

      const sale = await registerSale(tx, {
        customerId: linkedCustomerId,
        items: saleItems,
        discount,
        // Sem override, vale o que o cliente pediu.
        installmentsCount: installmentsCount ?? order.installmentsCount,
        paymentType: paymentType ?? order.paymentType,
        observation: observation ?? `Pedido #${order.id} pela vitrine`,
        coupon,
      });

      // O status já foi reivindicado no começo da transação; aqui só falta
      // amarrar qual venda nasceu dele.
      await tx.order.update({
        where: { id: order.id },
        data: { saleId: sale.id },
      });

      // A reserva cumpriu o papel: virou venda, o estoque já baixou.
      await tx.reservation.deleteMany({ where: { orderId: order.id } });

      return { orderId: order.id, saleId: sale.id, customerId: linkedCustomerId, total: sale.total };
    });

    return res.json(result);
  } catch (error) {
    return respondWithError(res, error, "Não foi possível confirmar o pedido.");
  }
}

/** Recusa o pedido, libera as reservas e guarda o motivo para o cliente ler. */
export async function cancel(req: Request, res: Response) {
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(400).json({ error: "Pedido inválido." });

  const body = parseOrderCancel(req.body);
  if (!body.ok) return res.status(400).json({ error: body.error });

  const { reason } = body.data;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const found = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });

      if (!found) throw new DomainError("Pedido não encontrado.", 404);
      if (found.status !== 'PENDING') {
        throw new DomainError("Só um pedido pendente pode ser recusado.", 409);
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelReason: reason },
      });

      // Sem isto o estoque ficaria preso a um pedido que não vai acontecer.
      await tx.reservation.deleteMany({ where: { orderId } });

      return updated;
    });

    return res.json({ id: order.id, status: order.status, cancelReason: order.cancelReason });
  } catch (error) {
    return respondWithError(res, error, "Não foi possível recusar o pedido.");
  }
}
