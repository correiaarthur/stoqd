import { z } from 'zod';

import { MAX_LINES_PER_CART, MAX_UNITS_PER_CART } from './availability.js';
import { cartItemsSchema, parseCartToken } from './cartItems.js';
import { MSG_PARCELAS, installmentsCountSchema, optionalInstallmentsCount } from './pricingRules.js';
import { bodyOf, isBlank, optional, parseWith, positiveInt } from './validate.js';

/**
 * Os corpos de pedido — criar, confirmar e recusar — e o que eles têm em comum com
 * a venda de balcão (`saleInput.ts`): forma de pagamento, observação, parcelas.
 */

const MSG_PAGAMENTO = "Forma de pagamento inválida.";

/**
 * VISTA ou PRAZO, e ausente vale à vista. Qualquer outra coisa é recusada: um
 * "PRZO" digitado errado, lido como à vista, registraria como paga uma venda que
 * ia ser fiada.
 */
export const paymentTypeSchema = z.preprocess(
  value => (isBlank(value) ? 'VISTA' : value),
  z.enum(['VISTA', 'PRAZO'], { error: MSG_PAGAMENTO })
);

/** Texto livre de quem finaliza: aparado, cortado no teto, e vazio vira `null`. */
export const observationSchema = (max: number) => z.preprocess(value => {
  if (value === undefined || value === null) return null;

  const text = String(value).trim().slice(0, max);
  return text === '' ? null : text;
}, z.string().nullable());

/** Valor digitado à mão (desconto): o que não for número vale 0. */
export const looseNumber = z.preprocess(value => Number(value) || 0, z.number());

/**
 * Parcelas de um pagamento: a prazo vale o que veio (1x a 12x); à vista é sempre
 * uma parcela só, mesmo que a tela tenha sobrado com um parcelamento escolhido
 * antes de voltar para à vista.
 */
export function installmentsFor<T extends { paymentType: 'VISTA' | 'PRAZO'; installmentsCount?: unknown }>(
  body: T,
  ctx: z.RefinementCtx
): number {
  if (body.paymentType !== 'PRAZO') return 1;

  const parsed = installmentsCountSchema.safeParse(body.installmentsCount);

  if (!parsed.success) {
    ctx.issues.push({ code: 'custom', message: MSG_PARCELAS, input: body.installmentsCount });
    return z.NEVER as never;
  }

  return parsed.data;
}

/** O cliente envia o carrinho como pedido pendente. */
export const orderCreateSchema = bodyOf({
  // Token inválido vale como ausente: o pedido nasce, só sem reserva para prender.
  cartToken: z.preprocess(parseCartToken, z.string().nullable()),
  items: cartItemsSchema({ maxLines: MAX_LINES_PER_CART, maxUnits: MAX_UNITS_PER_CART }),
  observation: observationSchema(500),
  paymentType: paymentTypeSchema,
  installmentsCount: z.unknown().optional(),
  couponCode: z.unknown().optional(),
}).transform((order, ctx) => ({ ...order, installmentsCount: installmentsFor(order, ctx) }));

export type OrderCreateInput = z.output<typeof orderCreateSchema>;

export const MSG_PRECO = "Escolha se o pedido será cobrado pelo preço do pedido ou pelo preço de hoje.";

/**
 * A loja confirma o pedido. Tudo é opcional: sem troca, valem o pagamento e as
 * parcelas que o cliente pediu.
 */
export const orderConfirmSchema = bodyOf({
  customerId: optional(positiveInt("Cliente escolhido inválido.")),
  createCustomer: z.preprocess(value => value === true, z.boolean()),
  priceSource: z.preprocess(value => (isBlank(value) ? 'order' : value), z.enum(['order', 'current'], { error: MSG_PRECO })),
  discount: looseNumber,
  installmentsCount: optionalInstallmentsCount,
  paymentType: z.preprocess(value => (isBlank(value) ? undefined : value), z.enum(['VISTA', 'PRAZO'], { error: MSG_PAGAMENTO }).optional()),
  observation: observationSchema(500),
  // `false` descarta o cupom que o cliente pediu; qualquer outra coisa mantém.
  keepCoupon: z.preprocess(value => value !== false, z.boolean()),
});

export type OrderConfirmInput = z.output<typeof orderConfirmSchema>;

/** A loja recusa, e o motivo é o que o cliente lê. */
export const orderCancelSchema = bodyOf({
  reason: z.preprocess(
    value => String(value ?? '').trim(),
    z.string().min(3, { error: "Explique o motivo da recusa — é o que o cliente vai ler." })
  ).transform(reason => reason.slice(0, 300)),
});

export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'ALL'] as const;

/** `?status=` da lista de pedidos; sem ele, os pendentes. */
export const orderListQuerySchema = bodyOf({
  status: z.preprocess(
    value => String(value ?? 'PENDING').toUpperCase(),
    z.enum(ORDER_STATUSES, { error: "Situação inválida." })
  ),
});

export const parseOrderCreate = (raw: unknown) => parseWith(orderCreateSchema, raw);
export const parseOrderConfirm = (raw: unknown) => parseWith(orderConfirmSchema, raw);
export const parseOrderCancel = (raw: unknown) => parseWith(orderCancelSchema, raw);
export const parseOrderListQuery = (raw: unknown) => parseWith(orderListQuerySchema, raw);
