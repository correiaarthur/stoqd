import { useState, useMemo } from 'react';
import { useSalesList, type SaleListItem } from '../hooks/useSalesList';
import { formatCurrency } from '../utils/formatters';
import './Sales.css';

type Period = '7D' | '30D' | '90D' | '1Y';

const PERIOD_DAYS: Record<Period, number> = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 };
const PERIOD_LABELS: Record<Period, string> = { '7D': '7 dias', '30D': '30 dias', '90D': '90 dias', '1Y': '1 ano' };

function getStartDate(period: Period) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (PERIOD_DAYS[period] - 1));
  return start;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function Sales() {
  const [period, setPeriod] = useState<Period>('30D');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const startDate = useMemo(() => getStartDate(period), [period]);
  const { sales, loading } = useSalesList(startDate);

  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sales;

    return sales.filter(sale =>
      String(sale.id).includes(term) ||
      (sale.customer?.name || 'consumidor final').toLowerCase().includes(term) ||
      sale.items.some(item => item.product.name.toLowerCase().includes(term))
    );
  }, [sales, search]);

  const totals = useMemo(() => filteredSales.reduce((acc, sale) => ({
    revenue: acc.revenue + sale.total,
    discount: acc.discount + (sale.discount || 0),
    pending: acc.pending + sale.pendingAmount,
  }), { revenue: 0, discount: 0, pending: 0 }), [filteredSales]);

  const toggle = (id: number) => setExpandedId(prev => (prev === id ? null : id));

  const renderItemsSummary = (sale: SaleListItem) => (
    sale.items.map(i => `${i.quantity > 1 ? `${i.quantity}x ` : ''}${i.product.name}`).join(', ')
  );

  return (
    <div className="page-container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Vendas</h1>
        <p className="subtitle">Histórico completo, incluindo vendas sem cliente cadastrado</p>
      </div>

      <div className="sales-stats">
        <div className="sales-stat base-card">
          <span className="label">Faturamento no período</span>
          <h2 className="value">{formatCurrency(totals.revenue)}</h2>
        </div>
        <div className="sales-stat base-card">
          <span className="label">Vendas</span>
          <h2 className="value">{filteredSales.length}</h2>
        </div>
        <div className="sales-stat base-card">
          <span className="label">Descontos concedidos</span>
          <h2 className="value">{formatCurrency(totals.discount)}</h2>
        </div>
        <div className="sales-stat base-card">
          <span className="label">A receber</span>
          <h2 className={`value ${totals.pending > 0 ? 'value-pending' : ''}`}>{formatCurrency(totals.pending)}</h2>
        </div>
      </div>

      <section className="page-card base-card">
        <div className="sales-toolbar">
          <div className="input-with-icon sales-search">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Buscar por nº da venda, cliente ou produto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="time-pills">
            {(Object.keys(PERIOD_DAYS) as Period[]).map(p => (
              <button
                key={p}
                className={`time-pill ${period === p ? 'active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-dim" style={{ padding: '2rem', textAlign: 'center' }}>Carregando vendas...</p>
        ) : filteredSales.length === 0 ? (
          <p className="text-dim" style={{ padding: '2rem', textAlign: 'center' }}>
            {search ? 'Nenhuma venda encontrada para essa busca.' : 'Nenhuma venda registrada neste período.'}
          </p>
        ) : (
          <div className="sales-list">
            {filteredSales.map(sale => {
              const isExpanded = expandedId === sale.id;
              const discount = sale.discount || 0;

              return (
                <div key={sale.id} className={`sale-card ${isExpanded ? 'expanded' : ''}`}>
                  <div className="sale-card-header" onClick={() => toggle(sale.id)}>
                    <div className="sale-card-main">
                      <div className="sale-card-title">
                        <strong>Venda #{sale.id}</strong>
                        <span className={`badge ${sale.isPaid ? 'badge-success' : 'badge-danger'}`}>
                          {sale.isPaid ? 'Paga' : `Deve ${formatCurrency(sale.pendingAmount)}`}
                        </span>
                        {discount > 0 && <span className="badge badge-discount">Desconto</span>}
                      </div>
                      <span className="sale-card-meta">
                        {formatDateTime(sale.date)} · {sale.customer?.name || 'Consumidor final'} · {sale.itemsCount} {sale.itemsCount === 1 ? 'item' : 'itens'}
                      </span>
                      <span className="sale-card-products" title={renderItemsSummary(sale)}>
                        {renderItemsSummary(sale)}
                      </span>
                    </div>

                    <div className="sale-card-right">
                      <span className="sale-card-total">{formatCurrency(sale.total)}</span>
                      <svg className={`chevron-icon ${isExpanded ? 'expanded' : ''}`} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="sale-card-body">
                      <table className="sale-items-table">
                        <thead>
                          <tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr>
                        </thead>
                        <tbody>
                          {sale.items.map(item => (
                            <tr key={item.id}>
                              <td>{item.product.name}</td>
                              <td>{item.quantity}</td>
                              <td>{formatCurrency(item.unitPrice)}</td>
                              <td>{formatCurrency(item.unitPrice * item.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3}>Subtotal</td>
                            <td>{formatCurrency(sale.grossTotal)}</td>
                          </tr>
                          {discount > 0 && (
                            <tr className="row-discount">
                              <td colSpan={3}>Desconto</td>
                              <td>− {formatCurrency(discount)}</td>
                            </tr>
                          )}
                          <tr className="row-total">
                            <td colSpan={3}>Total</td>
                            <td>{formatCurrency(sale.total)}</td>
                          </tr>
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
                                {inst.paidAt ? ' ✓' : ` · vence ${new Date(inst.dueDate).toLocaleDateString('pt-BR')}`}
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
        )}
      </section>
    </div>
  );
}
