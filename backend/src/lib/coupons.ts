import { z } from 'zod';

import { formatBRL } from './format.js';
import type { Prisma$Tx } from './availability.js';
import { prisma } from './prisma.js';
import { toCents } from './pricingRules.js';
import { bodyOf, optional, parseWith, type ParseResult } from './validate.js';

/**
 * Cupom de desconto.
 *
 * A validação roda duas vezes de propósito: uma no checkout, para o cliente ver
 * o valor antes de enviar, e outra dentro da transação da venda. Só a segunda
 * vale — entre uma e outra o cupom pode ter vencido, esgotado os usos ou sido
 * desativado, e é a segunda que incrementa `usedCount`.
 */

export type CouponReason =
  | 'not_found'
  | 'inactive'
  | 'expired'
  | 'exhausted'
  | 'below_minimum';

export type CouponCheck =
  | { ok: true; couponId: number; code: string; discount: number }
  | { ok: false; reason: CouponReason; message: string; minimumTotal?: number };

/** "  ciclo10 " e "CICLO10" são o mesmo cupom. */
export function normalizeCouponCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

export function isValidCouponCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code);
}

/**
 * A linha de cupom como o banco a guarda.
 *
 * Escrita à mão, e não derivada do client do Prisma, porque `checkCoupon`
 * aceita tanto a linha vinda do banco quanto um objeto montado na mão nos
 * testes. O que não se repete mais é a forma: quem precisa de um subconjunto
 * tira dela com `Omit`/`Pick` em vez de redigitar os campos.
 */
export type CouponRow = {
  id: number;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minimumTotal: number | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
};

const MSG_VALOR = "Informe o valor do desconto.";
const MSG_USOS = "O limite de usos precisa ser um número inteiro maior que zero.";
const MSG_VALIDADE = "Data de validade inválida.";

/**
 * O fim do dia da validade.
 *
 * O input date manda "2026-09-30", que `new Date` lê como meia-noite UTC.
 * Aplicar setHours local depois disso empurra o vencimento para o dia
 * ANTERIOR aqui (UTC-3) — um cupom "válido até 30/09" morreria em 29/09.
 * Montando a data campo a campo, ela nasce local e o fim do dia é o fim
 * do dia certo. `null` quando a data não existe.
 */
function fimDoDia(value: unknown): Date | null {
  const text = String(value).trim();
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  const date = dayOnly
    ? new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]), 23, 59, 59, 999)
    : new Date(text);

  if (Number.isNaN(date.getTime())) return null;

  if (!dayOnly) date.setHours(23, 59, 59, 999);

  return date;
}

/**
 * O que o corpo da requisição pode definir: a linha inteira menos o que é do
 * banco. `id` é do autoincremento e `usedCount` só sobe quando uma venda gasta
 * o cupom — nenhum dos dois se aceita de fora.
 */
export const couponSchema = bodyOf({
  code: z.preprocess(normalizeCouponCode, z.string().refine(isValidCouponCode, {
    error: "O código precisa ter de 3 a 24 letras, números ou hífen.",
  })),

  // Qualquer coisa que não seja FIXED é percentual.
  type: z.preprocess(value => (value === 'FIXED' ? 'FIXED' : 'PERCENT'), z.enum(['PERCENT', 'FIXED'])),

  value: z.coerce.number({ error: MSG_VALOR }).positive({ error: MSG_VALOR }),

  minimumTotal: optional(z.coerce.number({ error: "Pedido mínimo inválido." }).min(0, { error: "Pedido mínimo inválido." })),

  maxUses: optional(z.coerce.number({ error: MSG_USOS }).int({ error: MSG_USOS }).min(1, { error: MSG_USOS })),

  expiresAt: z.preprocess(
    value => (value ? value : null),
    z.unknown().transform(fimDoDia).refine(date => date !== null, { error: MSG_VALIDADE }).nullable()
  ),

  active: z.preprocess(value => value !== false, z.boolean()),
}).superRefine((coupon, ctx) => {
  if (coupon.type === 'PERCENT' && coupon.value > 100) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: "Um desconto percentual não pode passar de 100%." });
  }
});

export type CouponInput = z.output<typeof couponSchema>;

export function parseCouponBody(raw: unknown): ParseResult<CouponInput> {
  return parseWith(couponSchema, raw);
}

/** Desconto em reais que o cupom gera sobre um subtotal. */
export function couponDiscountFor(coupon: Pick<CouponRow, 'type' | 'value'>, subtotal: number): number {
  const raw = coupon.type === 'PERCENT'
    ? subtotal * (coupon.value / 100)
    : coupon.value;

  // Cupom nunca faz a loja pagar para vender.
  return toCents(Math.min(Math.max(raw, 0), subtotal));
}

function reject(reason: CouponReason, message: string, minimumTotal?: number): CouponCheck {
  return minimumTotal === undefined
    ? { ok: false, reason, message }
    : { ok: false, reason, message, minimumTotal };
}

/**
 * Confere um cupom contra um subtotal.
 *
 * As mensagens dizem o que aconteceu — "cupom vencido" e "cupom não existe"
 * mandam a pessoa fazer coisas diferentes. A única que é deliberadamente vaga é
 * a de código inexistente: distinguir "não existe" de "existe mas está inativo"
 * ajudaria quem estivesse tentando adivinhar códigos.
 */
export async function checkCoupon(
  client: Prisma$Tx | typeof prisma,
  rawCode: unknown,
  subtotal: number
): Promise<CouponCheck> {
  const code = normalizeCouponCode(rawCode);

  if (!isValidCouponCode(code)) {
    return reject('not_found', "Cupom inválido.");
  }

  const coupon = await client.coupon.findUnique({ where: { code } }) as CouponRow | null;

  if (!coupon) return reject('not_found', "Cupom não encontrado.");
  if (!coupon.active) return reject('inactive', "Este cupom não está mais valendo.");

  if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
    return reject('expired', "Este cupom venceu.");
  }

  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return reject('exhausted', "Este cupom já atingiu o limite de usos.");
  }

  if (coupon.minimumTotal !== null && subtotal < coupon.minimumTotal) {
    return reject(
      'below_minimum',
      `Este cupom vale a partir de ${formatBRL(coupon.minimumTotal)}.`,
      coupon.minimumTotal
    );
  }

  return {
    ok: true,
    couponId: coupon.id,
    code: coupon.code,
    discount: couponDiscountFor(coupon, subtotal),
  };
}

/**
 * Gasta um uso do cupom, dentro da transação da venda.
 *
 * O `usedCount` só sobe aqui — um pedido pendente ainda não consumiu nada, e um
 * pedido recusado não pode consumir. O update é condicional (`usedCount` ainda
 * abaixo do teto) para dois pedidos simultâneos não passarem do limite: se a
 * condição não bate, nenhuma linha é afetada e a venda recusa o cupom.
 */
export async function consumeCoupon(tx: Prisma$Tx, couponId: number): Promise<boolean> {
  const coupon = await tx.coupon.findUnique({ where: { id: couponId } }) as CouponRow | null;

  if (!coupon) return false;

  const { count } = await tx.coupon.updateMany({
    where: {
      id: couponId,
      active: true,
      ...(coupon.maxUses !== null ? { usedCount: { lt: coupon.maxUses } } : {}),
    },
    data: { usedCount: { increment: 1 } },
  });

  return count === 1;
}

