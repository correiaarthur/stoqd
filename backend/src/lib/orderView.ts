import type { Prisma } from '@prisma/client';

import type { StockView } from './availability.js';
import { couponDiscountFor } from './coupons.js';
import { getActivePrice, PRODUCT_STOCK_SELECT } from './pricing.js';
import { computeTotals, previewInstallmentValue, sumLines } from './pricingRules.js';

/**
 * Como o pedido aparece para a loja, na tela de Vendas.
 *
 * Tudo aqui é conta sobre dados já lidos — sem banco, sem relógio —, de modo que
 * o service lê e esta camada só monta. É onde mora a regra de "o que a tela
 * precisa mostrar para a loja decidir": o preço do pedido ao lado do de hoje, o
 * que o cliente pediu com as contas prontas, e quem pode ser o cliente de balcão
 * dele.
 */

/** O que a lista de pedidos lê de cada pedido. */
export const ADMIN_ORDER_INCLUDE = {
  user: {
    select: {
      id: true, name: true, phone: true, email: true,
      customer: { select: { id: true, name: true } },
    },
  },
  items: { include: { product: { select: PRODUCT_STOCK_SELECT } } },
  coupon: true,
} satisfies Prisma.OrderInclude;

export type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof ADMIN_ORDER_INCLUDE }>;

/** Um cliente de balcão que pode ser o dono da conta que fez o pedido. */
export type CustomerCandidate = { id: number; name: string; phone: string | null; email: string | null };

type StockById = ReadonlyMap<number, Pick<StockView, 'available'>>;

/** Taxa de juros de cada parcelamento que a loja deixou ligado. */
type PlanRates = ReadonlyMap<number, number>;

/** Mudança de preço menor que meio centavo é arredondamento, não mudança. */
const PRICE_TOLERANCE = 0.005;

/** Telefones e e-mails dos pedidos cuja conta ainda não tem cliente: onde procurar candidatos. */
export function contactsToMatch(orders: readonly AdminOrderRow[]): string[] {
  return orders
    .filter(order => !order.user.customer)
    .flatMap(order => [order.user.phone, order.user.email])
    .filter((contact): contact is string => Boolean(contact));
}

/**
 * Clientes de balcão com o mesmo telefone ou e-mail da conta: a pista para
 * sugerir o vínculo. Conta sem e-mail casa só pelo telefone — comparar dois nulos
 * não pode sugerir que duas pessoas sem e-mail são a mesma. A decisão continua
 * sendo da loja: o sistema não funde ninguém sozinho.
 */
export function suggestedCustomersFor(
  user: Pick<AdminOrderRow['user'], 'phone' | 'email' | 'customer'>,
  candidates: readonly CustomerCandidate[]
): CustomerCandidate[] {
  if (user.customer) return [];

  return candidates.filter(candidate =>
    (candidate.phone !== null && candidate.phone === user.phone) ||
    (candidate.email !== null && user.email !== null && candidate.email === user.email)
  );
}

/** Um item com o preço do pedido e o de hoje, e o que o estoque diz dele. */
export function buildItemView(item: AdminOrderRow['items'][number], stock: StockById) {
  const currentPrice = getActivePrice(item.product);

  return {
    productId: item.productId,
    name: item.product.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    currentPrice,
    priceChanged: Math.abs(currentPrice - item.unitPrice) > PRICE_TOLERANCE,
    quantityInStock: item.product.quantity,
    available: stock.get(item.productId)?.available ?? 0,
    hasStock: item.product.quantity >= item.quantity,
  };
}

/**
 * O que o cliente pediu, já com as contas feitas — para a tela de confirmação
 * abrir preenchida em vez de fazer a loja recalcular.
 */
export function buildRequestedView(order: AdminOrderRow, subtotal: number, planRates: PlanRates) {
  const couponDiscount = order.coupon ? couponDiscountFor(order.coupon, subtotal) : 0;

  // `null` quando a loja desligou aquele parcelamento depois do pedido: a tela
  // precisa avisar em vez de cobrar juros que não existem mais.
  const interestPercent = order.paymentType === 'PRAZO'
    ? planRates.get(order.installmentsCount) ?? null
    : 0;

  const totals = computeTotals({
    grossTotal: subtotal,
    discount: couponDiscount,
    interestPercent: interestPercent ?? 0,
  });

  return {
    paymentType: order.paymentType,
    installmentsCount: order.installmentsCount,
    interestPercent,
    coupon: order.coupon
      ? { id: order.coupon.id, code: order.coupon.code, discount: couponDiscount }
      : null,
    subtotal: totals.grossTotal,
    discount: totals.discount,
    interest: totals.interest,
    total: totals.finalTotal,
    installmentValue: order.installmentsCount > 1
      ? previewInstallmentValue(totals.finalTotal, order.installmentsCount)
      : totals.finalTotal,
  };
}

/** O pedido inteiro, como a tela de Vendas o recebe. */
export function buildAdminOrderView(
  order: AdminOrderRow,
  context: { stock: StockById; planRates: PlanRates; candidates: readonly CustomerCandidate[] }
) {
  const items = order.items.map(item => buildItemView(item, context.stock));
  const subtotal = sumLines(items);

  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    observation: order.observation,
    cancelReason: order.cancelReason,
    saleId: order.saleId,
    requested: buildRequestedView(order, subtotal, context.planRates),
    user: {
      id: order.user.id,
      name: order.user.name,
      phone: order.user.phone,
      email: order.user.email,
      customer: order.user.customer,
    },
    suggestedCustomers: suggestedCustomersFor(order.user, context.candidates),
    items,
    total: subtotal,
    hasStockForAll: items.every(item => item.hasStock),
  };
}
