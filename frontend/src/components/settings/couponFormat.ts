import { formatCurrency, formatDate } from '../../utils/formatters';
import type { Coupon } from './types';

export const STATUS_LABEL: Record<Coupon['status'], string> = {
  active: 'Valendo',
  inactive: 'Desativado',
  expired: 'Vencido',
  exhausted: 'Esgotado',
};

/** O desconto como se lê: "10%" ou "R$ 5,00". */
export const discountOf = (c: Coupon) => (c.type === 'PERCENT' ? `${c.value}%` : formatCurrency(c.value));

/** As regras do cupom numa linha: mínimo, limite e validade. */
export function ruleOf(c: Coupon) {
  const parts = [
    c.minimumTotal === null ? 'sem mínimo' : `pedido mínimo ${formatCurrency(c.minimumTotal)}`,
    c.expiresAt ? `até ${formatDate(c.expiresAt)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}
