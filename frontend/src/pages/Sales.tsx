import { useState, useMemo } from 'react';
import { useSalesList, type SaleListItem } from '../hooks/useSalesList';
import { PendingOrders } from '../components/PendingOrders';
import { formatCurrency, formatDate, formatDayMonth } from '../utils/formatters';
import { MONTH_LONG, lastMonths, startOf } from '../utils/dashboardMonth';
import './Sales.css';

/** Períodos em meses corridos: o atual, 3, 6 ou 12. */
const PERIODS = [
  { months: 1, label: 'Mês' },
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '1 ano' },
] as const;

/** Como a venda foi paga, em palavras, e a cor do texto. */
function paymentOf(sale: SaleListItem) {
  const total = sale.installments.length;
  if (total <= 1) return { text: 'À vista', tone: 'ink' as const };

  const paid = sale.installments.filter(i => i.paidAt).length;
  if (paid === total) return { text: `${total}x · quitada`, tone: 'good' as const };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const late = sale.installments.some(i => !i.paidAt && new Date(i.dueDate) < today);
  return { text: `${total}x · ${paid} de ${total} ${paid === 1 ? 'paga' : 'pagas'}`, tone: late ? ('bad' as const) : ('ink' as const) };
}

/** Os quadradinhos da venda a prazo: pago, em aberto ou atrasado. */
function installmentState(inst: SaleListItem['installments'][number]) {
  if (inst.paidAt) return 'paid';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(inst.dueDate) < today ? 'late' : 'open';
}

export function Sales() {
  const [months, setMonths] = useState<number>(1);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const startDate = useMemo(() => startOf(lastMonths(months, new Date())[0]), [months]);
  const { sales, loading, refetch } = useSalesList(startDate);

  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sales;

    return sales.filter(sale =>
      String(sale.id).includes(term) ||
      (sale.customer?.name || 'consumidor final').toLowerCase().includes(term) ||
      sale.items.some(item => item.product.name.toLowerCase().includes(term))
    );
  }, [sales, search]);

  const totals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filteredSales.reduce((acc, sale) => ({
      revenue: acc.revenue + sale.total,
      discount: acc.discount + (sale.discount || 0),
      pending: acc.pending + sale.pendingAmount,
      units: acc.units + sale.items.reduce((n, i) => n + i.quantity, 0),
      lateCount: acc.lateCount + sale.installments.filter(i => !i.paidAt && new Date(i.dueDate) < today).length,
    }), { revenue: 0, discount: 0, pending: 0, units: 0, lateCount: 0 });
  }, [filteredSales]);

  const toggle = (id: number) => setExpandedId(prev => (prev === id ? null : id));

  const renderItemsSummary = (sale: SaleListItem) => (
    sale.items.map(i => `${i.product.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')
  );

  return (
    <div className="sl">
      <header className="sl-head">
        <div className="sl-head-text">
          <span className="sl-kicker">Operação · {MONTH_LONG[new Date().getMonth()].toLowerCase()}</span>
          <h1 className="sl-title">Vendas</h1>
        </div>
        <div role="group" aria-label="Período" className="period-group">
          {PERIODS.map(p => (
            <button
              key={p.months}
              type="button"
              className="period-btn"
              aria-pressed={months === p.months}
              onClick={() => setMonths(p.months)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* Um pedido confirmado vira venda: a lista abaixo precisa recarregar
          junto, senão a venda que acabou de nascer não aparece. */}
      <PendingOrders onConfirmed={refetch} />

      <div className="sl-summary">
        <div className="sl-stat">
          <span className="sl-label">Faturamento no período</span>
          <strong className="sl-stat-value">{formatCurrency(totals.revenue)}</strong>
          <span className="sl-stat-note">já sem os descontos</span>
        </div>
        <div className="sl-stat">
          <span className="sl-label">Vendas</span>
          <strong className="sl-stat-value">{filteredSales.length}</strong>
          <span className="sl-stat-note">{totals.units} {totals.units === 1 ? 'unidade' : 'unidades'}</span>
        </div>
        <div className="sl-stat">
          <span className="sl-label">Descontos concedidos</span>
          <strong className="sl-stat-value sl-good">{formatCurrency(totals.discount)}</strong>
          <span className="sl-stat-note">cupons e balcão</span>
        </div>
        <div className="sl-stat">
          <span className="sl-label">A receber</span>
          <strong className={`sl-stat-value ${totals.pending > 0 ? 'sl-accent' : ''}`}>{formatCurrency(totals.pending)}</strong>
          <span className="sl-stat-note">
            {totals.lateCount > 0 ? `${totals.lateCount} ${totals.lateCount === 1 ? 'parcela atrasada' : 'parcelas atrasadas'}` : 'nada atrasado'}
          </span>
        </div>
      </div>

      <section aria-labelledby="livro-titulo" className="sl-book">
        <div className="sl-book-head">
          <h2 id="livro-titulo" className="sl-h2">Livro de <em>vendas</em></h2>
          <div className="input-with-icon sl-search">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              aria-label="Buscar venda"
              placeholder="Nº da venda, cliente ou produto"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="sl-ledger-wrap" aria-busy="true" aria-label="Carregando vendas">
            <div className="sl-ledger">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="sl-row sl-row-skeleton" aria-hidden="true">
                  <span className="skeleton" style={{ width: 40, height: 22 }} />
                  <span className="skeleton skeleton-line" style={{ width: 44, height: 16 }} />
                  <span className="skeleton skeleton-line" style={{ width: '70%', height: 16 }} />
                  <span className="skeleton skeleton-line" style={{ width: '85%', height: 16 }} />
                  <span className="skeleton skeleton-line" style={{ width: 110, height: 16 }} />
                  <span className="skeleton skeleton-line" style={{ width: 80, height: 18, marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          </div>
        ) : filteredSales.length === 0 ? (
          <p className="sl-empty">
            {search ? 'Nenhuma venda encontrada para essa busca.' : 'Nenhuma venda registrada neste período.'}
          </p>
        ) : (
          <div className="sl-ledger-wrap">
            <div className="sl-ledger">
              <div className="sl-row sl-row-head" role="presentation">
                <span>Nº</span><span>Data</span><span>Cliente</span><span>Produtos</span><span>Pagamento</span><span className="num">Total</span>
              </div>
              {filteredSales.map(sale => {
                const isExpanded = expandedId === sale.id;
                const discount = sale.discount || 0;
                const pay = paymentOf(sale);

                return (
                  <div key={sale.id} className={`sl-entry ${isExpanded ? 'is-open' : ''}`}>
                    <button
                      type="button"
                      className="sl-row sl-row-main"
                      aria-expanded={isExpanded}
                      onClick={() => toggle(sale.id)}
                    >
                      <span className="sl-n">{String(sale.id).padStart(4, '0')}</span>
                      <span className="sl-date">{formatDayMonth(sale.date)}</span>
                      <span className="sl-customer">{sale.customer?.name || 'Consumidor final'}</span>
                      <span className="sl-products" title={renderItemsSummary(sale)}>{renderItemsSummary(sale)}</span>
                      <span className="sl-pay">
                        <span className={`sl-pay-text sl-pay-${pay.tone}`}>{pay.text}</span>
                        {sale.installments.length > 1 && (
                          <span className="sl-dots" aria-hidden="true">
                            {sale.installments.map(inst => <span key={inst.id} className={`sl-dot sl-dot-${installmentState(inst)}`} />)}
                          </span>
                        )}
                      </span>
                      <strong className="num sl-total">{formatCurrency(sale.total)}</strong>
                    </button>

                    {isExpanded && (
                      <div className="sl-detail">
                        <table className="sl-items">
                          <thead>
                            <tr><th>Produto</th><th className="num">Qtd</th><th className="num">Unit.</th><th className="num">Subtotal</th></tr>
                          </thead>
                          <tbody>
                            {sale.items.map(item => (
                              <tr key={item.id}>
                                <td>{item.product.name}</td>
                                <td className="num">{item.quantity}</td>
                                <td className="num">{formatCurrency(item.unitPrice)}</td>
                                <td className="num">{formatCurrency(item.unitPrice * item.quantity)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr><td colSpan={3}>Subtotal</td><td className="num">{formatCurrency(sale.grossTotal)}</td></tr>
                            {discount > 0 && (
                              <tr className="row-discount"><td colSpan={3}>Desconto</td><td className="num">− {formatCurrency(discount)}</td></tr>
                            )}
                            <tr className="row-total"><td colSpan={3}>Total</td><td className="num">{formatCurrency(sale.total)}</td></tr>
                          </tfoot>
                        </table>

                        {sale.observation && (
                          <p className="sale-observation">
                            <span className="text-dim">Observação: </span>{sale.observation}
                          </p>
                        )}

                        {sale.installments.length > 1 && (
                          <div className="sale-installments">
                            <span className="text-dim">Parcelas</span>
                            <div className="sale-installments-list">
                              {sale.installments.map(inst => (
                                <span key={inst.id} className={`inst-pill ${inst.paidAt ? 'paid' : 'pending'}`}>
                                  {inst.number}/{sale.installments.length} · {formatCurrency(inst.value)}
                                  {inst.paidAt ? ' ✓' : ` · vence ${formatDate(inst.dueDate)}`}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
