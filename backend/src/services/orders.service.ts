import type { Prisma } from '@prisma/client';

import {
  IDENTIFIED_RESERVATION_MINUTES,
  getStockView,
  loadStockProducts,
  reservationExpiry,
  type Prisma$Tx,
} from '../lib/availability.js';
import { checkCoupon } from '../lib/coupons.js';
import { DomainError } from '../lib/errors.js';
import { notifyNewOrder } from '../lib/notifications.js';
import {
  ADMIN_ORDER_INCLUDE,
  buildAdminOrderView,
  contactsToMatch,
  type CustomerCandidate,
} from '../lib/orderView.js';
import type { OrderConfirmInput, OrderCreateInput } from '../lib/orderInput.js';
import { getActivePrice } from '../lib/pricing.js';
import { getInterestPercent, sumLines } from '../lib/pricingRules.js';
import { prisma } from '../lib/prisma.js';
import { registerSale } from '../lib/sales.js';

/**
 * O ciclo de vida do pedido: criar, listar para a loja, confirmar e recusar.
 *
 * O controller lê o HTTP e responde; aqui está o que acontece de fato, em
 * transação, e os erros de regra saem como `DomainError` com o status certo.
 */

/** Um pedido pendente por vez já é bastante para quem atende sozinha. */
const MAX_PENDING_ORDERS_PER_USER = 3;

// --- Criar ----------------------------------------------------------------

/** Quem já tem pedidos demais esperando resposta não envia outro. */
async function assertCanPlaceOrder(tx: Prisma$Tx, userId: number) {
  const pendingCount = await tx.order.count({ where: { userId, status: 'PENDING' } });

  if (pendingCount >= MAX_PENDING_ORDERS_PER_USER) {
    throw new DomainError(
      "Você já tem pedidos aguardando confirmação. Espere a resposta antes de enviar outro.",
      429
    );
  }
}

/**
 * Confere cada item do carrinho contra o estoque de agora e congela o preço que a
 * pessoa viu. A reserva do próprio carrinho não conta contra ele — mas o que
 * outra pessoa reservou, sim.
 */
async function priceCartItems(
  tx: Prisma$Tx,
  cartItems: OrderCreateInput['items'],
  cartToken: string | null
) {
  const { products, byId } = await loadStockProducts(cartItems.map(item => item.productId), tx);
  const stock = await getStockView(products, { tx, ...(cartToken ? { excludeCartToken: cartToken } : {}) });

  return cartItems.map(item => {
    const product = byId.get(item.productId);
    if (!product) throw new DomainError("Um dos produtos do carrinho não existe mais.");

    const available = stock.get(product.id)?.available ?? 0;

    if (available < item.quantity) {
      throw new DomainError(
        available === 0
          ? `${product.name} esgotou enquanto você finalizava. Remova o item para continuar.`
          : `Restam ${available} de ${item.quantity} unidades de ${product.name}. Ajuste a quantidade para continuar.`
      );
    }

    return {
      productId: product.id,
      quantity: item.quantity,
      // Quem decide o valor cobrado ainda é a venda, na confirmação — mas com o
      // preço do pedido à vista.
      unitPrice: getActivePrice(product),
    };
  });
}

/**
 * A opção de parcelamento é conferida no banco: uma que a loja desligou não pode
 * chegar até a confirmação como se estivesse valendo.
 */
async function assertInstallmentsAvailable(tx: Prisma$Tx, paymentType: string, installments: number) {
  if (paymentType === 'PRAZO' && await getInterestPercent(tx, installments) === null) {
    throw new DomainError(`O parcelamento em ${installments}x não está disponível.`);
  }
}

/**
 * O cupom é conferido agora só para o pedido não nascer com um código que já não
 * vale. Quem gasta o uso é a venda, na confirmação — um pedido pendente ainda não
 * consumiu nada, e um recusado não pode.
 */
async function couponIdForOrder(tx: Prisma$Tx, couponCode: unknown, subtotal: number): Promise<number | null> {
  if (!couponCode) return null;

  const coupon = await checkCoupon(tx, couponCode, subtotal);
  if (!coupon.ok) throw new DomainError(coupon.message);

  return coupon.couponId;
}

/**
 * Cria o pedido a partir do carrinho e dispara o aviso.
 *
 * Nenhum estoque baixa aqui: o pedido nasce PENDING e só vira venda quando o
 * admin confirma. As reservas do carrinho passam a apontar para o pedido —
 * ficam presas a ele, e só saem quando o pedido virar venda ou for recusado.
 */
export async function createOrder(userId: number, input: OrderCreateInput) {
  const { cartToken, items: cartItems, observation, paymentType, installmentsCount, couponCode } = input;

  const order = await prisma.$transaction(async (tx) => {
    await assertCanPlaceOrder(tx, userId);

    const items = await priceCartItems(tx, cartItems, cartToken);
    await assertInstallmentsAvailable(tx, paymentType, installmentsCount);
    const couponId = await couponIdForOrder(tx, couponCode, sumLines(items));

    const created = await tx.order.create({
      data: { userId, observation, paymentType, installmentsCount, couponId, items: { create: items } },
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

  return { id: order.id, status: order.status, total };
}

// --- Listar ---------------------------------------------------------------

/**
 * Pedidos para a tela de Vendas. Cada item vem com o preço do pedido e o preço
 * de hoje: se mudaram no intervalo, a tela mostra os dois e a loja escolhe qual
 * cobrar — senão o cliente vê um valor e paga outro.
 */
export async function listOrders(status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ALL') {
  const orders = await prisma.order.findMany({
    where: status === 'ALL' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: ADMIN_ORDER_INCLUDE,
  });

  const contacts = contactsToMatch(orders);

  // Três leituras que não dependem uma da outra.
  const [stock, plans, candidates] = await Promise.all([
    getStockView(orders.flatMap(order => order.items.map(item => item.product))),
    prisma.installmentPlan.findMany({ where: { active: true } }),
    contacts.length > 0
      ? prisma.customer.findMany({
          where: { OR: [{ phone: { in: contacts } }, { email: { in: contacts } }] },
          select: { id: true, name: true, phone: true, email: true },
        })
      : Promise.resolve([] as CustomerCandidate[]),
  ]);

  const planRates = new Map(plans.map(plan => [plan.installments, plan.interestPercent]));

  return orders.map(order => buildAdminOrderView(order, { stock, planRates, candidates }));
}

// --- Confirmar ------------------------------------------------------------

const CONFIRM_INCLUDE = {
  items: { include: { product: true } },
  user: true,
  coupon: true,
} satisfies Prisma.OrderInclude;

type ConfirmableOrder = Prisma.OrderGetPayload<{ include: typeof CONFIRM_INCLUDE }>;

/**
 * Lê o pedido e o reivindica **agora**, não no fim.
 *
 * A checagem de status existe para a mensagem ser boa, mas ela não protege de
 * nada: a versão anterior só virava `CONFIRMED` depois de registrar a venda, então
 * dois cliques simultâneos passavam os dois pela checagem e nasciam duas vendas
 * para um pedido — estoque baixado duas vezes, cliente cobrado em dobro. Medido:
 * cinco confirmações simultâneas geravam cinco vendas.
 *
 * Com a condição dentro do UPDATE, o Postgres tranca a linha e reavalia
 * `status = 'PENDING'` depois de a outra transação commitar. A segunda não afeta
 * linha nenhuma e desiste. Mesmo padrão do decremento de estoque em `registerSale`
 * e do `consumeCoupon`.
 */
async function claimPendingOrder(tx: Prisma$Tx, orderId: number): Promise<ConfirmableOrder> {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: CONFIRM_INCLUDE });

  if (!order) throw new DomainError("Pedido não encontrado.", 404);

  if (order.status !== 'PENDING') {
    throw new DomainError(
      order.status === 'CONFIRMED'
        ? "Este pedido já virou venda."
        : "Este pedido foi recusado e não pode ser confirmado.",
      409
    );
  }

  const claimed = await tx.order.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: { status: 'CONFIRMED' },
  });

  if (claimed.count !== 1) throw new DomainError("Este pedido já virou venda.", 409);

  return order;
}

/**
 * Liga a conta ao cliente de balcão e devolve o id dele.
 *
 * O vínculo acontece aqui, e não no cadastro: é o momento em que a loja já vai
 * falar com a pessoa para confirmar, e o sistema não precisa adivinhar sozinho que
 * duas pessoas são a mesma. Conta que já tem cliente o mantém.
 */
async function linkCustomer(
  tx: Prisma$Tx,
  order: ConfirmableOrder,
  choice: { customerId: number | null; createCustomer: boolean }
): Promise<number> {
  if (order.user.customerId) return order.user.customerId;

  if (choice.customerId) {
    const existing = await tx.customer.findUnique({ where: { id: choice.customerId } });
    if (!existing) throw new DomainError("Cliente escolhido não existe.", 404);

    const alreadyLinked = await tx.user.findUnique({ where: { customerId: existing.id } });
    if (alreadyLinked && alreadyLinked.id !== order.userId) {
      throw new DomainError("Este cliente já está vinculado a outra conta.", 409);
    }

    await tx.user.update({ where: { id: order.userId }, data: { customerId: existing.id } });
    return existing.id;
  }

  if (choice.createCustomer) {
    const created = await tx.customer.create({
      data: { name: order.user.name, phone: order.user.phone, email: order.user.email },
    });

    await tx.user.update({ where: { id: order.userId }, data: { customerId: created.id } });
    return created.id;
  }

  throw new DomainError("Escolha o cliente da venda ou crie um novo a partir dos dados do pedido.");
}

/**
 * O cupom do pedido é revalidado contra o subtotal que a venda vai cobrar de
 * fato — que muda se a loja escolher o preço de hoje em vez do preço do pedido.
 */
async function couponForSale(
  tx: Prisma$Tx,
  order: ConfirmableOrder,
  saleItems: Array<{ quantity: number; unitPrice: number }>,
  keepCoupon: boolean
): Promise<{ id: number; discount: number } | null> {
  if (!keepCoupon || !order.couponId) return null;

  const checked = await checkCoupon(tx, order.coupon?.code, sumLines(saleItems));

  if (!checked.ok) {
    throw new DomainError(
      `O cupom ${order.coupon?.code} não vale mais: ${checked.message.toLowerCase()} Confirme sem o cupom ou recuse o pedido.`
    );
  }

  return { id: checked.couponId, discount: checked.discount };
}

/**
 * Confirma o pedido: vincula ou cria o Customer, revalida o estoque e cria a
 * venda pelo mesmo caminho da venda de balcão.
 *
 * A revalidação pode recusar — e é justamente o desenho. Um pedido pendente não
 * segura estoque (decisão D2, o balcão ganha), então o item pode ter sido vendido
 * na loja no intervalo. Quando acontece, a mensagem diz qual produto e quanto
 * restou, em vez de um erro genérico. A transação inteira reverte: o pedido volta
 * a ficar pendente.
 */
export async function confirmOrder(orderId: number, input: OrderConfirmInput) {
  const { customerId, createCustomer, priceSource, discount, installmentsCount, paymentType, observation, keepCoupon } = input;

  return prisma.$transaction(async (tx) => {
    const order = await claimPendingOrder(tx, orderId);
    const linkedCustomerId = await linkCustomer(tx, order, { customerId, createCustomer });

    const saleItems = order.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: priceSource === 'order' ? item.unitPrice : getActivePrice(item.product),
    }));

    const sale = await registerSale(tx, {
      customerId: linkedCustomerId,
      items: saleItems,
      discount,
      // Sem troca, vale o que o cliente pediu.
      installmentsCount: installmentsCount ?? order.installmentsCount,
      paymentType: paymentType ?? order.paymentType,
      observation: observation ?? `Pedido #${order.id} pela vitrine`,
      coupon: await couponForSale(tx, order, saleItems, keepCoupon),
    });

    // O status já foi reivindicado no começo da transação; aqui só falta amarrar
    // qual venda nasceu dele.
    await tx.order.update({ where: { id: order.id }, data: { saleId: sale.id } });

    // A reserva cumpriu o papel: virou venda, o estoque já baixou.
    await tx.reservation.deleteMany({ where: { orderId: order.id } });

    return { orderId: order.id, saleId: sale.id, customerId: linkedCustomerId, total: sale.total };
  });
}

// --- Recusar --------------------------------------------------------------

/** Recusa o pedido, libera as reservas e guarda o motivo para o cliente ler. */
export async function cancelOrder(orderId: number, reason: string) {
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

  return { id: order.id, status: order.status, cancelReason: order.cancelReason };
}
