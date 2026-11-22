import { describe, it, expect } from 'vitest';
import type { SoldItem } from '../../hooks/useSalesReport';
import { lastMonths, daysIn, revenueByDay, unitsByWeek, topProducts, itemsOfPeriod, totalsByMonth } from '../dashboardMonth';

const item = (date: string, over: Partial<SoldItem> = {}): SoldItem => ({
  saleId: 1, date, quantity: 1, revenue: 10, productName: 'A', brandName: 'b', categoryName: 'c', ...over,
});
const OUT = [{ year: 2026, month: 9 }];

describe('dashboardMonth', () => {
  it('lista os últimos meses do mais antigo ao atual, atravessando o ano', () => {
    expect(lastMonths(3, new Date(2026, 0, 31))).toEqual([
      { year: 2025, month: 10 }, { year: 2025, month: 11 }, { year: 2026, month: 0 },
    ]);
  });

  it('em 31/03 não pula fevereiro', () => {
    expect(lastMonths(2, new Date(2026, 2, 31))).toEqual([{ year: 2026, month: 1 }, { year: 2026, month: 2 }]);
  });

  it('conta os dias do mês, inclusive fevereiro bissexto', () => {
    expect(daysIn({ year: 2026, month: 9 })).toBe(31);
    expect(daysIn({ year: 2024, month: 1 })).toBe(29);
  });

  it('separa os itens do período, nas duas pontas', () => {
    const items = [item('2026-09-30T23:00:00'), item('2026-10-05T12:00:00'), item('2026-11-01T00:30:00')];
    expect(itemsOfPeriod(items, OUT)).toHaveLength(1);
    expect(itemsOfPeriod(items, lastMonths(2, new Date(2026, 10, 15)))).toHaveLength(2);
  });

  it('soma a receita no dia certo, atravessando dois meses', () => {
    const months = lastMonths(2, new Date(2026, 10, 15));
    const days = revenueByDay([item('2026-10-05T12:00:00', { revenue: 30 }), item('2026-10-05T18:00:00', { revenue: 12.5 }), item('2026-11-02T10:00:00', { revenue: 7 })], months);
    expect(days).toHaveLength(31 + 30);
    expect(days[4].value).toBe(42.5);
    expect(days[31 + 1].value).toBe(7);
    expect(days[0].value).toBe(0);
  });

  it('corta as semanas de segunda a domingo (outubro/2026 começa numa quinta)', () => {
    expect(unitsByWeek([], OUT).map(w => w.label)).toEqual(['01–04', '05–11', '12–18', '19–25', '26–31']);
  });

  it('as semanas atravessam a virada do mês quando o período tem dois', () => {
    const labels = unitsByWeek([], lastMonths(2, new Date(2026, 10, 15))).map(w => w.label);
    expect(labels).toContain('26–01');
    expect(labels[labels.length - 1]).toBe('30–30');
  });

  it('soma as unidades na semana do dia', () => {
    const weeks = unitsByWeek([item('2026-10-03T12:00:00', { quantity: 2 }), item('2026-10-20T12:00:00', { quantity: 3 })], OUT);
    expect(weeks.map(w => w.units)).toEqual([2, 0, 0, 3, 0]);
  });

  it('totaliza cada mês do período', () => {
    const months = lastMonths(3, new Date(2026, 10, 15));
    const totals = totalsByMonth([item('2026-09-10T12:00:00', { revenue: 5, quantity: 2 }), item('2026-11-03T12:00:00', { revenue: 9 })], months);
    expect(totals.map(t => [t.revenue, t.units])).toEqual([[5, 2], [0, 0], [9, 1]]);
  });

  it('ranqueia por unidades e desempata pelo nome', () => {
    const ranked = topProducts([
      item('2026-10-01T12:00:00', { productName: 'B', quantity: 2 }),
      item('2026-10-02T12:00:00', { productName: 'A', quantity: 2 }),
      item('2026-10-03T12:00:00', { productName: 'C', quantity: 5 }),
    ], 2);
    expect(ranked).toEqual([{ name: 'C', units: 5 }, { name: 'A', units: 2 }]);
  });
});
