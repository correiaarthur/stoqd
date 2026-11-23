import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSalesReport } from '../hooks/useSalesReport';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { formatCurrency, formatDayMonth } from '../utils/formatters';
import {
  MONTH_LONG, MONTH_SHORT, lastMonths, startOf, itemsOfPeriod, revenueByDay,
  unitsByWeek, totalsByMonth, topProducts, type MonthRef, type Bucket,
} from '../utils/dashboardMonth';
import './Dashboard.css';

/** Os períodos, sempre contados para trás a partir do mês atual. */
const PERIODS = [
  { id: 1, label: 'Mês', title: null },
  { id: 3, label: '3 meses', title: 'Últimos 3 meses' },
  { id: 6, label: '6 meses', title: 'Últimos 6 meses' },
  { id: 12, label: '1 ano', title: 'Último ano' },
] as const;
const LONGEST = 12;
// Só no mês o caixa e o volume mostram dia e semana; acima disso, mês a mês.
const DETAILED_UP_TO = 1;

/**
 * A visão geral por período: o mês atual, os últimos 3, 6 ou 12 meses — os
 * mesmos períodos de Vendas. O relatório vem uma vez só, do período mais longo; trocar
 * de período só refaz as contas — não vai ao servidor.
 */
export function Dashboard() {
  const [count, setCount] = useState<number>(1);
  // Calculado uma vez: uma data nova a cada render faria o hook refazer o fetch em loop.
  const now = useMemo(() => new Date(), []);
  const period = PERIODS.find(p => p.id === count) ?? PERIODS[0];
  const months = useMemo(() => lastMonths(count, now), [count, now]);
  const detailed = count <= DETAILED_UP_TO;

  const cutoff = useMemo(() => startOf(lastMonths(LONGEST, now)[0]), [now]);
  const { soldItems, loading } = useSalesReport(cutoff);
  const { summary } = useDashboardSummary();

  const periodItems = useMemo(() => itemsOfPeriod(soldItems, months), [soldItems, months]);
  const revenue = periodItems.reduce((sum, i) => sum + i.revenue, 0);
  const units = periodItems.reduce((sum, i) => sum + i.quantity, 0);
  const salesCount = new Set(periodItems.map(i => i.saleId)).size;

  const days = useMemo(() => revenueByDay(periodItems, months), [periodItems, months]);
  const monthTotals = useMemo(() => totalsByMonth(periodItems, months), [periodItems, months]);
  const volume: Bucket[] = useMemo(
    () => detailed
      ? unitsByWeek(periodItems, months)
      : monthTotals.map(t => ({ label: MONTH_SHORT[t.month.month], units: t.units })),
    [detailed, periodItems, months, monthTotals],
  );
  const ranking = useMemo(() => topProducts(periodItems, 10), [periodItems]);

  const first = months[0];
  const last = months[months.length - 1];
  const rangeText = count === 1
    ? String(last.year)
    : `${MONTH_SHORT[first.month].toLowerCase()}/${first.year} – ${MONTH_SHORT[last.month].toLowerCase()}/${last.year}`;

  const inventory = summary?.inventory;

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="dash-head-text">
          <span className="dash-kicker">Visão geral · {rangeText}</span>
          <h1 className="dash-title">{period.title ?? MONTH_LONG[last.month]} <em>em números</em></h1>
        </div>
        <div role="group" aria-label="Período" className="period-group">
          {PERIODS.map(p => (
            <button
              key={p.id}
              type="button"
              className="period-btn"
              aria-pressed={count === p.id}
              onClick={() => setCount(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="dash-hero">
            <section className="dash-card dash-revenue" aria-label="Receita líquida">
              <span className="dash-label">Receita líquida</span>
              <strong className="dash-big">{formatCurrency(revenue)}</strong>
              <span className="dash-note">
                Já descontados os abatimentos
                {inventory && (
                  <> · <strong className="dash-profit">{formatCurrency(inventory.totalExpectedProfit)} de lucro previsto no estoque</strong></>
                )}
              </span>
            </section>
            <div className="dash-side">
              <section className="dash-card dash-stat" aria-label="Unidades vendidas">
                <span className="dash-label">Unidades vendidas</span>
                <strong className="dash-mid">{units}</strong>
                <span className="dash-note">em {salesCount} {salesCount === 1 ? 'venda' : 'vendas'}</span>
              </section>
              <section className="dash-card dash-stat" aria-label="Ticket médio por item">
                <span className="dash-label">Ticket médio por item</span>
                <strong className="dash-mid">{formatCurrency(units > 0 ? revenue / units : 0)}</strong>
                <span className="dash-note">receita ÷ unidades</span>
              </section>
            </div>
          </div>

          {inventory && (
            <section className="dash-card dash-block" aria-labelledby="sit-titulo">
              <div className="dash-block-head">
                <h2 id="sit-titulo" className="dash-h2">Situação <em>do estoque</em></h2>
                <Link to="/estoque" className="dash-link">Ver estoque</Link>
              </div>
              <div className="dash-situation">
                <Situation label="Valor em estoque" value={formatCurrency(inventory.totalStockValue)} tone="ink" />
                <Situation label="Lucro previsto" value={formatCurrency(inventory.totalExpectedProfit)} tone="good" />
                <Situation label="Vencidos" value={String(inventory.expiredItems)} tone={inventory.expiredItems > 0 ? 'bad' : 'ink'} />
                <Situation label={`Vencem em ${inventory.expiryWarningDays} dias`} value={String(inventory.expiringSoonItems)} tone={inventory.expiringSoonItems > 0 ? 'warn' : 'ink'} />
                <Situation label="Esgotados" value={String(inventory.outOfStockItems)} tone={inventory.outOfStockItems > 0 ? 'bad' : 'ink'} />
              </div>
            </section>
          )}

          <div className="dash-pair">
            <CashFlow days={days} monthTotals={monthTotals} detailed={detailed} />
            <Volume buckets={volume} detailed={detailed} />
          </div>

          <section className="dash-card dash-block" aria-labelledby="mais-titulo">
            <h2 id="mais-titulo" className="dash-h2">Mais <em>vendidos</em></h2>
            {ranking.length === 0 ? (
              <p className="dash-empty">Nenhuma venda neste período.</p>
            ) : (
              <ol className="dash-ranking">
                {ranking.map((r, i) => (
                  <li key={r.name} className="dash-rank">
                    <div className="dash-rank-top">
                      <span className="dash-rank-n">{i + 1}º</span>
                      <strong>{r.units} un</strong>
                    </div>
                    <span className="dash-rank-name">{r.name}</span>
                    <span className="dash-rank-track">
                      <span className="dash-rank-fill" style={{ width: `${Math.round((r.units / ranking[0].units) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Situation({ label, value, tone }: { label: string; value: string; tone: 'ink' | 'good' | 'bad' | 'warn' }) {
  return (
    <div className={`dash-sit dash-sit-${tone}`}>
      <span className="dash-label">{label}</span>
      <strong className="dash-sit-value">{value}</strong>
    </div>
  );
}

/** O caixa: uma barra por dia (até dois meses) ou por mês (períodos maiores). */
function CashFlow({ days, monthTotals, detailed }: {
  days: { date: Date; value: number }[];
  monthTotals: { month: MonthRef; revenue: number }[];
  detailed: boolean;
}) {
  const bars = detailed
    ? days.map(d => ({ value: d.value, title: formatDayMonth(d.date), label: '' }))
    : monthTotals.map(t => ({ value: t.revenue, title: `${MONTH_LONG[t.month.month]}/${t.month.year}`, label: MONTH_SHORT[t.month.month] }));
  const max = Math.max(...bars.map(b => b.value), 0);
  const total = bars.reduce((sum, b) => sum + b.value, 0);

  // Dia a dia, cinco marcas espaçadas por igual; mês a mês, o nome de cada mês.
  const ticks = detailed
    ? [0, 0.25, 0.5, 0.75, 1].map(f => {
        const d = days[Math.round(f * (days.length - 1))].date;
        return formatDayMonth(d);
      })
    : null;

  return (
    <section className="dash-card dash-block" aria-labelledby="fluxo-titulo">
      <div className="dash-block-head">
        <h2 id="fluxo-titulo" className="dash-h2">Fluxo <em>de caixa</em></h2>
        <span className="dash-hint">{detailed ? 'receita por dia' : 'receita por mês'}</span>
      </div>
      <div className="dash-bars" role="img" aria-label={`Receita do período: ${formatCurrency(total)} no total`}>
        {bars.map((b, i) => (
          <div
            key={i}
            className={`dash-bar ${b.value === 0 ? 'is-zero' : ''}`}
            style={{ height: b.value === 0 || max === 0 ? undefined : `${Math.max(4, (b.value / max) * 100)}%` }}
            title={`${b.title} · ${formatCurrency(b.value)}`}
          />
        ))}
      </div>
      <div className={detailed ? 'dash-ticks' : 'dash-ticks dash-ticks-bars'} aria-hidden="true">
        {ticks
          ? ticks.map((t, i) => <span key={i}>{t}</span>)
          : bars.map((b, i) => <span key={i}>{b.label}</span>)}
      </div>
    </section>
  );
}

function Volume({ buckets, detailed }: { buckets: Bucket[]; detailed: boolean }) {
  const max = Math.max(...buckets.map(b => b.units), 0);
  return (
    <section className="dash-card dash-block" aria-labelledby="vol-titulo">
      <div className="dash-block-head">
        <h2 id="vol-titulo" className="dash-h2">Volume <em>de vendas</em></h2>
        <span className="dash-hint">{detailed ? 'unidades por semana' : 'unidades por mês'}</span>
      </div>
      <div className="dash-weeks">
        {buckets.map((b, i) => (
          <div key={i} className="dash-week">
            <span className="dash-week-value">{b.units === 0 ? '—' : `${b.units} un`}</span>
            <div
              className={`dash-week-bar ${b.units === 0 ? 'is-zero' : ''}`}
              style={{ height: b.units === 0 || max === 0 ? undefined : `${Math.round((b.units / max) * 80)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="dash-week-labels">
        {buckets.map((b, i) => <span key={i}>{b.label}</span>)}
      </div>
    </section>
  );
}

/**
 * O esqueleto dos números: as mesmas caixas da tela pronta, no mesmo lugar e
 * com a mesma altura, para nada pular quando os dados chegam. O cabeçalho e os
 * meses já estão na tela, então ficam de fora.
 */
function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando a visão geral" className="dash-skeleton">
      <div className="dash-hero">
        <section className="dash-card dash-revenue">
          <span className="skeleton skeleton-line" style={{ width: 130, height: 16 }} />
          <span className="skeleton" style={{ width: 'min(100%, 460px)', height: 99 }} />
          <span className="skeleton skeleton-line" style={{ width: 'min(100%, 380px)', height: 21 }} />
        </section>
        <div className="dash-side">
          {[0, 1].map(i => (
            <section key={i} className="dash-card dash-stat">
              <span className="skeleton skeleton-line" style={{ width: 150, height: 16 }} />
              <span className="skeleton" style={{ width: 150, height: 48 }} />
              <span className="skeleton skeleton-line" style={{ width: 110, height: 21 }} />
            </section>
          ))}
        </div>
      </div>

      <section className="dash-card dash-block">
        <div className="dash-block-head" style={{ height: 46 }}>
          <span className="skeleton" style={{ width: 280, height: 34 }} />
          <span className="skeleton skeleton-line" style={{ width: 90, height: 16 }} />
        </div>
        <div className="dash-situation">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="dash-sit dash-sit-ink">
              <span className="skeleton skeleton-line" style={{ width: '70%', height: 16 }} />
              <span className="skeleton" style={{ width: '55%', height: 48 }} />
            </div>
          ))}
        </div>
      </section>

      <div className="dash-pair">
        {[0, 1].map(i => (
          <section key={i} className="dash-card dash-block">
            <div className="dash-block-head" style={{ height: 42 }}>
              <span className="skeleton" style={{ width: 220, height: 34 }} />
              <span className="skeleton skeleton-line" style={{ width: 110, height: 16 }} />
            </div>
            <div className="dash-bars dash-bars-skeleton">
              {Array.from({ length: i === 0 ? 30 : 5 }, (_, k) => (
                <span key={k} className="skeleton" style={{ flex: '1 1 0', height: `${25 + ((k * 37) % 60)}%` }} />
              ))}
            </div>
            <span className="skeleton skeleton-line" style={{ width: '100%', height: 18 }} />
          </section>
        ))}
      </div>

      <section className="dash-card dash-block">
        <span className="skeleton" style={{ width: 230, height: 42 }} />
        <div className="dash-ranking">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="dash-rank">
              <div className="dash-rank-top">
                <span className="skeleton" style={{ width: 34, height: 36 }} />
                <span className="skeleton skeleton-line" style={{ width: 46, height: 18 }} />
              </div>
              <span className="skeleton skeleton-line" style={{ width: '85%', height: 22 }} />
              <span className="skeleton" style={{ width: '100%', height: 6 }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
