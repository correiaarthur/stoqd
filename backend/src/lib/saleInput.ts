import { z } from 'zod';

import { MAX_LINES_PER_CART, MAX_UNITS_PER_CART } from './availability.js';
import { cartItemsSchema } from './cartItems.js';
import { installmentsFor, looseNumber, observationSchema, paymentTypeSchema } from './orderInput.js';
import { bodyOf, isBlank, optional, parseWith, positiveInt } from './validate.js';

/** Venda de balcão: o que o admin envia ao fechar uma venda. */
export const saleCreateSchema = bodyOf({
  customerId: optional(positiveInt("Cliente inválido.")),
  // "O carrinho está vazio" não é a frase certa para uma venda de balcão.
  items: cartItemsSchema({
    maxLines: MAX_LINES_PER_CART,
    maxUnits: MAX_UNITS_PER_CART,
    emptyMessage: "A venda precisa ter pelo menos um item.",
  }),
  installmentsCount: z.unknown().optional(),
  observation: observationSchema(500),
  discount: looseNumber,
  paymentType: paymentTypeSchema,
  couponCode: z.unknown().optional(),
}).transform((sale, ctx) => ({ ...sale, installmentsCount: installmentsFor(sale, ctx) }));

export type SaleCreateInput = z.output<typeof saleCreateSchema>;

export const MAX_SALES_PER_PAGE = 200;
const DEFAULT_SALES_PER_PAGE = 50;

/** Uma data de `?from=`/`?to=`: ausente vale `undefined`; o que não for data é recusado. */
const optionalDate = (message: string) => z.preprocess(
  value => (isBlank(value) ? undefined : String(value)),
  z.string()
    .transform(text => new Date(text))
    .refine(date => !Number.isNaN(date.getTime()), { error: message })
    .optional()
);

/** Filtros da lista de vendas. `limit` estranho vale o padrão, e acima do teto é cortado. */
export const salesQuerySchema = bodyOf({
  from: optionalDate("Período inválido."),
  to: optionalDate("Período inválido."),
  customerId: optional(positiveInt("Cliente inválido.")),
  limit: z.preprocess(value => Math.min(Number(value) || DEFAULT_SALES_PER_PAGE, MAX_SALES_PER_PAGE), z.number()),
});

/** O relatório de vendas exige o início do período: sem ele puxaria o histórico inteiro. */
export const salesReportQuerySchema = bodyOf({
  from: z.preprocess(
    value => (isBlank(value) ? undefined : String(value)),
    z.string({ error: "Informe a data inicial do período." })
      .transform(text => new Date(text))
      .refine(date => !Number.isNaN(date.getTime()), { error: "Data inicial inválida." })
  ),
});

/**
 * `?subtotal=` e `subtotal` do corpo: o que não for número finito, ou for negativo,
 * vale 0. Nunca lança — por isso o `parse` direto é seguro.
 */
export const subtotalSchema = z.preprocess(value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(number, 0) : 0;
}, z.number());

export const parseSaleCreate = (raw: unknown) => parseWith(saleCreateSchema, raw);
export const parseSalesQuery = (raw: unknown) => parseWith(salesQuerySchema, raw);
export const parseSalesReportQuery = (raw: unknown) => parseWith(salesReportQuerySchema, raw);
