import type { Prisma$Tx } from './availability.js';
import { prisma } from './prisma.js';
import { toCents } from './pricingRules.js';

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

type CouponRow = {
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

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
