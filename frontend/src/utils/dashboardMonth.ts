import type { SoldItem } from '../hooks/useSalesReport';

export const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MONTH_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Um mês do calendário. `month` vai de 0 (janeiro) a 11. */
export interface MonthRef { year: number; month: number }

/** Os últimos `count` meses, do mais antigo ao atual. */
export function lastMonths(count: number, now: Date): MonthRef[] {
  const result: MonthRef[] = [];
  for (let back = count - 1; back >= 0; back--) {
    // Dia 1 antes de recuar: em 31/12, voltar um mês daria 31/11 (= 01/12).
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    result.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return result;
}

/** Primeiro dia (meia-noite local) do mês: o corte do relatório. */
export function startOf(month: MonthRef): Date {
  return new Date(month.year, month.month, 1);
}

export function daysIn(month: MonthRef): number {
  return new Date(month.year, month.month + 1, 0).getDate();
}

/** Os itens vendidos dentro dos meses dados (do primeiro dia do primeiro ao último do último). */
export function itemsOfPeriod(items: SoldItem[], months: MonthRef[]): SoldItem[] {
  const first = months[0];
  const last = months[months.length - 1];
  const from = new Date(first.year, first.month, 1).getTime();
  const until = new Date(last.year, last.month + 1, 1).getTime();
  return items.filter(item => {
    const t = new Date(item.date).getTime();
    return t >= from && t < until;
  });
}

/** Cada dia dos meses, em ordem, com a receita do dia. */
export function revenueByDay(items: SoldItem[], months: MonthRef[]): { date: Date; value: number }[] {
  const days: { date: Date; value: number }[] = [];
  const index = new Map<string, number>();
  for (const m of months) {
    for (let d = 1; d <= daysIn(m); d++) {
      index.set(`${m.year}-${m.month}-${d}`, days.length);
      days.push({ date: new Date(m.year, m.month, d), value: 0 });
    }
  }
  for (const item of items) {
    const when = new Date(item.date);
    const at = index.get(`${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`);
    if (at !== undefined) days[at].value += item.revenue;
  }
  return days;
}

export interface Bucket { label: string; units: number }

/**
 * Unidades por semana, de segunda a domingo, cortadas nas pontas do período: o
 * primeiro dia abre a primeira semana (mesmo numa quinta) e o último fecha a última.
 */
export function unitsByWeek(items: SoldItem[], months: MonthRef[]): Bucket[] {
  const first = months[0];
  const last = months[months.length - 1];
  const start = new Date(first.year, first.month, 1);
  const end = new Date(last.year, last.month, daysIn(last));
  const pad = (n: number) => String(n).padStart(2, '0');

  const weeks: { from: Date; to: Date; units: number }[] = [];
  let from = start;
  while (from <= end) {
    const untilSunday = from.getDay() === 0 ? 0 : 7 - from.getDay();
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + untilSunday);
    const clipped = to > end ? end : to;
    weeks.push({ from, to: clipped, units: 0 });
    from = new Date(clipped.getFullYear(), clipped.getMonth(), clipped.getDate() + 1);
  }
  for (const item of items) {
    const t = new Date(item.date);
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const week = weeks.find(w => day >= w.from && day <= w.to);
    if (week) week.units += item.quantity;
  }
  return weeks.map(w => ({ label: `${pad(w.from.getDate())}–${pad(w.to.getDate())}`, units: w.units }));
}

export interface MonthTotal { month: MonthRef; revenue: number; units: number }

/** Receita e unidades de cada mês do período. */
export function totalsByMonth(items: SoldItem[], months: MonthRef[]): MonthTotal[] {
  const totals = months.map(month => ({ month, revenue: 0, units: 0 }));
  for (const item of items) {
    const t = new Date(item.date);
    const row = totals.find(r => r.month.year === t.getFullYear() && r.month.month === t.getMonth());
    if (row) { row.revenue += item.revenue; row.units += item.quantity; }
  }
  return totals;
}

export interface Ranked { name: string; units: number }

export function topProducts(items: SoldItem[], limit: number): Ranked[] {
  const groups = new Map<string, number>();
  for (const item of items) groups.set(item.productName, (groups.get(item.productName) ?? 0) + item.quantity);
  return [...groups.entries()]
    .map(([name, units]) => ({ name, units }))
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name))
    .slice(0, limit);
}
