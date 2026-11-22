export const formatCurrency = (value: number | string) => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

export const parseCurrencyInput = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers === '') return '';
  return (Number(numbers) / 100).toFixed(2);
};

// Porcentagem é digitada direto: "10" são 10%, e não 10 centavos.
export const parsePercentInput = (value: string) => {
  const cleaned = value.replace(',', '.').replace(/[^\d.]/g, '');
  if (cleaned === '') return '';

  const [whole, ...rest] = cleaned.split('.');
  const normalized = rest.length > 0 ? `${whole}.${rest.join('').slice(0, 2)}` : whole;

  return Number(normalized) > 100 ? '100' : normalized;
};

// --- Datas ---------------------------------------------------------------
//
// Todas leem o instante no fuso do navegador, em pt-BR. Entrada vazia ou
// inválida vira '' — nunca o texto "Invalid Date" na tela.

type DateInput = string | number | Date | null | undefined;

function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 22/11/2026 */
export const formatDate = (value: DateInput) =>
  toValidDate(value)?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) ?? '';

/** 22/11/26 — para listas apertadas, onde o ano inteiro não cabe. */
export const formatDateCompact = (value: DateInput) =>
  toValidDate(value)?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) ?? '';

/** 22/11 */
export const formatDayMonth = (value: DateInput) =>
  toValidDate(value)?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) ?? '';

/** 22/11/26 14:30 */
export const formatDateTime = (value: DateInput) =>
  toValidDate(value)?.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }) ?? '';

/**
 * "Hoje, 14:30" no mesmo dia; senão dia e mês, e o ano (2 dígitos) só quando
 * não é o ano corrente. `now` existe para o teste não depender do relógio.
 */
export function formatRelativeDate(value: DateInput, now: Date = new Date()) {
  const date = toValidDate(value);
  if (!date) return '';

  if (date.toDateString() === now.toDateString()) {
    return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    ...(date.getFullYear() !== now.getFullYear() && { year: '2-digit' }),
  });
}
