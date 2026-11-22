import { formatDate } from './formatters';

export const EXPIRY_WARNING_DAYS = 90;

export type ExpiryStatus = 'none' | 'expired' | 'soon' | 'ok';

/**
 * Lê a validade como **data de calendário**, não como instante.
 *
 * O banco guarda `DateTime` e a API serializa `2026-04-06T00:00:00.000Z`. Em
 * qualquer fuso a oeste de Greenwich — o Brasil inteiro — `new Date()` disso
 * cai no dia 5 às 21h locais, e a data some um dia: a tela mostrava 05/04 para
 * um produto cadastrado como 06/04, e um produto que vence hoje aparecia como
 * já vencido.
 *
 * Validade não tem hora. O que importa é o dia escrito na embalagem, então só
 * a parte `YYYY-MM-DD` é lida, e lida à meia-noite local.
 */
function parseExpiryDay(expiryDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiryDate);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function getExpiryStatus(expiryDate: string | null | undefined): ExpiryStatus {
  if (!expiryDate) return 'none';

  const due = parseExpiryDay(expiryDate);
  if (!due) return 'none';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (due < today) return 'expired';

  const limit = new Date(today);
  limit.setDate(limit.getDate() + EXPIRY_WARNING_DAYS);

  return due <= limit ? 'soon' : 'ok';
}

export function formatExpiryDate(expiryDate: string) {
  const due = parseExpiryDay(expiryDate);
  if (!due) return '—';

  return formatDate(due);
}

/** Dias de hoje até a validade (0 = vence hoje, negativo = já venceu); `null` sem data. */
export function daysUntilExpiry(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const due = parseExpiryDay(expiryDate);
  if (!due) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
