import type { Prisma } from '@prisma/client';

import { sumLines } from './pricingRules.js';

/**
 * O histórico de compras de um cliente, como a tela "Minha conta" o recebe.
 *
 * Reúne duas fontes numa lista só: os pedidos feitos pela vitrine e — quando a
 * loja ligou a conta a um cliente de balcão — as vendas de balcão dessa pessoa.
 * Tudo aqui é montagem sobre dados já lidos, sem banco: o service lê, esta camada
 * só forma.
 */

/** Os pedidos da conta, com a venda que nasceu deles (parcelas e cupom). */
export const HISTORY_ORDER_INCLUDE = {
  items: { include: { product: { select: { name: true } } } },
  sale: {
    include: {
      installments: { orderBy: { number: 'asc' } },
      coupon: { select: { code: true } },
    },
  },
} satisfies Prisma.OrderInclude;

/** As vendas de balcão do cliente ligado. */
export const HISTORY_SALE_INCLUDE = {
  items: { include: { product: { select: { name: true } } } },
  installments: { orderBy: { number: 'asc' } },
  coupon: { select: { code: true } },
} satisfies Prisma.SaleInclude;

export type HistoryOrderRow = Prisma.OrderGetPayload<{ include: typeof HISTORY_ORDER_INCLUDE }>;
export type HistorySaleRow = Prisma.SaleGetPayload<{ include: typeof HISTORY_SALE_INCLUDE }>;

type LineItem = { quantity: number; unitPrice: number; product: { name: string } };
type InstallmentRow = { number: number; value: number; dueDate: Date; paidAt: Date | null };

/** Só o que a tela mostra de cada item: o nome, não o produto inteiro. */
export function serializeItems(items: readonly LineItem[]) {
  return items.map(item => ({
    name: item.product.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

/** As parcelas como a tela as mostra, mais o que falta pagar e se já quitou. */
export function serializeInstallments(installments: readonly InstallmentRow[]) {
  const pending = installments.filter(installment => !installment.paidAt);

  return {
    installments: installments.map(installment => ({
      number: installment.number,
      value: installment.value,
      dueDate: installment.dueDate,
      paidAt: installment.paidAt,
    })),
    pendingAmount: pending.reduce((acc, installment) => acc + installment.value, 0),
    isPaid: installments.length > 0 && pending.length === 0,
  };
}

/**
 * Um pedido da vitrine. Enquanto pendente o total é o do pedido; confirmado, é o
 * que a venda realmente cobrou — desconto, juros e mudança de preço já aplicados.
 */
export function buildOrderEntry(order: HistoryOrderRow) {
  return {
    source: 'ORDER' as const,
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    cancelReason: order.cancelReason,
    saleId: order.saleId,
    total: order.sale?.total ?? sumLines(order.items),
    discount: order.sale?.discount ?? 0,
    interest: order.sale?.interest ?? 0,
    couponCode: order.sale?.coupon?.code ?? null,
    items: serializeItems(order.items),
    ...serializeInstallments(order.sale?.installments ?? []),
  };
}

/** Uma venda de balcão do cliente ligado: já confirmada por definição. */
export function buildSaleEntry(sale: HistorySaleRow) {
  return {
    source: 'SALE' as const,
    id: sale.id,
    status: 'CONFIRMED' as const,
    createdAt: sale.date,
    cancelReason: null,
    saleId: sale.id,
    total: sale.total,
    discount: sale.discount ?? 0,
    interest: sale.interest ?? 0,
    couponCode: sale.coupon?.code ?? null,
    items: serializeItems(sale.items),
    ...serializeInstallments(sale.installments),
  };
}

/** Pedidos e vendas de balcão numa lista só, do mais novo para o mais antigo. */
export function buildPurchaseHistory(orders: readonly HistoryOrderRow[], counterSales: readonly HistorySaleRow[]) {
  return [...orders.map(buildOrderEntry), ...counterSales.map(buildSaleEntry)]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
