import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { getApiErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/formatters';
import type { CustomerStatement, Installment, StatementSale, StatementSaleItem } from '../hooks/useCustomers';
import './CustomerStatementModal.css';

interface Props {
  customerId: number | null;
  onClose: () => void;
  onRefresh: () => void;
}

export function CustomerStatementModal({ customerId, onClose, onRefresh }: Props) {
  const [expandedSales, setExpandedSales] = useState<number[]>([]);

  // `onClose` chega como arrow inline do pai, então muda de identidade a cada
  // render. Numa dependência do fetch isso viraria um laço de refetch; a ref
  // guarda sempre a versão mais recente sem entrar na conta das dependências.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [activeCustomer, setActiveCustomer] = useState<CustomerStatement | null>(null);
  const [loading, setLoading] = useState(false);

  // O histórico é buscado só quando um cliente é aberto — a listagem não carrega
  // as vendas de todo mundo.
  const loadStatement = useCallback(async () => {
    if (!customerId) { setActiveCustomer(null); return; }

    try {
      setLoading(true);
      const res = await api.get<CustomerStatement>(`/customers/${customerId}/statement`);
      setActiveCustomer(res.data);

      const pendingSaleIds = (res.data.sales || [])
        .filter(sale => sale.installments?.some(installment => !installment.paidAt))
        .map(sale => sale.id);
      setExpandedSales(pendingSaleIds);
    } catch (err) {
      alert(getApiErrorMessage(err, 'Erro ao carregar o histórico do cliente.'));
      onCloseRef.current();
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { loadStatement(); }, [loadStatement]);

  if (!customerId) return null;

  const toggleSale = (saleId: number) => {
    setExpandedSales(prev =>
      prev.includes(saleId) ? prev.filter(id => id !== saleId) : [...prev, saleId]
    );
  };

  const handlePay = async (installmentId: number) => {
    try {
      await api.patch(`/installments/${installmentId}/pay`, { paidAt: new Date().toISOString() });
      await loadStatement();
      onRefresh();
    } catch (err) {
      alert(getApiErrorMessage(err, 'Erro ao processar a baixa da parcela.'));
    }
  };

  const formatDateBR = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit' 
    });
  };

  const sortedSales = [...(activeCustomer?.sales || [])].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content statement-modal">
        
        <div className="statement-header">
          <h2>Histórico: {activeCustomer?.name ?? ''}</h2>
          <button className="btn-secondary" onClick={onClose}>✕ Fechar</button>
        </div>

        <div className="statement-legend">
          <span className="legend-item"><div className="box paid"></div> Pago em dia</span>
          <span className="legend-item"><div className="box paid-late"></div> Pago com atraso</span>
          <span className="legend-item"><div className="box pending"></div> A vencer</span>
          <span className="legend-item"><div className="box overdue"></div> Atrasado</span>
        </div>

        <div className="statement-sales-list">
          {loading ? (
            <p className="empty-state" style={{ textAlign: 'center', padding: '2rem' }}>Carregando histórico...</p>
          ) : sortedSales.length === 0 ? (
            <p className="empty-state" style={{ textAlign: 'center', padding: '2rem' }}>Nenhum histórico de compras.</p>
          ) : (
            sortedSales.map((sale: StatementSale) => {
              const isExpanded = expandedSales.includes(sale.id);

              // Venda antiga pode ter `discount` nulo em vez de zero.
              const discount = sale.discount ?? 0;

              const sortedInstallments = [...(sale.installments || [])].sort((a, b) =>
                new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
              );

              const productNames = sale.items && sale.items.length > 0
                ? sale.items.map((i: StatementSaleItem) =>
                    `${i.quantity > 1 ? i.quantity + 'x ' : ''}${i.product?.name || 'Produto desconhecido'}`
                  ).join(', ')
                : 'Produtos não especificados';

              return (
                <div key={sale.id} className="sale-accordion-card">
                  
                  <div className="sale-accordion-header" onClick={() => toggleSale(sale.id)}>
                    <div className="sale-info-left">
                      <h4>Venda #{sale.id} - {formatDateBR(sale.date)}</h4>
                      <span className="sale-products-label" title={productNames}>{productNames}</span>
                    </div>
                    <div className="sale-info-right">
                      <span className="sale-total">
                        {discount > 0 && (
                          <s className="sale-gross">{formatCurrency(sale.total + discount)}</s>
                        )}
                        {formatCurrency(sale.total)}
                      </span>
                      <svg
                        className={`chevron-icon ${isExpanded ? 'expanded' : ''}`}
                        xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="sale-accordion-body">

                      {(discount > 0 || sale.observation) && (
                        <div className="sale-extra-info">
                          {discount > 0 && (
                            <div className="sale-extra-row">
                              <span className="sale-extra-label">Desconto concedido</span>
                              <span className="sale-extra-value">− {formatCurrency(discount)}</span>
                            </div>
                          )}
                          {sale.observation && (
                            <div className="sale-extra-row">
                              <span className="sale-extra-label">Observação</span>
                              <span className="sale-extra-note">{sale.observation}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="installments-squares">
                        {sortedInstallments.map((inst: Installment, idx: number) => {
                          let statusClass = 'pending';
                          
                          if (inst.paidAt) {
                            const paidDate = new Date(inst.paidAt);
                            const dueDate = new Date(inst.dueDate);

                            paidDate.setHours(0,0,0,0);
                            dueDate.setHours(0,0,0,0);
                            
                            if (paidDate > dueDate) {
                              statusClass = 'paid-late';
                            } else {
                              statusClass = 'paid';
                            }

                          } else {
                            const today = new Date();
                            const dueDate = new Date(inst.dueDate);
                            today.setHours(0,0,0,0);
                            dueDate.setHours(0,0,0,0);
                            
                            if (dueDate < today) {
                              statusClass = 'overdue';
                            }
                          }

                          return (
                            <div key={inst.id} className={`inst-square ${statusClass}`} title={`Parcela ${idx + 1}`}>
                              {idx + 1}
                            </div>
                          );
                        })}
                      </div>

                      <div className="installments-list">
                        <h5 className="installments-title">Próximos pagamentos:</h5>
                        {sortedInstallments.filter(i => !i.paidAt).length === 0 ? (
                          <p className="text-dim" style={{ fontSize: '0.85rem' }}>Todas as parcelas pagas! 🎉</p>
                        ) : (
                          sortedInstallments.map((inst: Installment, idx: number) => {
                            if (inst.paidAt) return null;
                            
                            return (
                              <div key={inst.id} className="installment-row">
                                <span className="inst-name">Parcela {idx + 1} - {formatCurrency(Number(inst.value))}</span>
                                <div className="inst-actions">
                                  <span className="inst-date">Vence: {formatDateBR(inst.dueDate)}</span>
                                  <button className="btn-pay" onClick={() => handlePay(inst.id)}>Baixar</button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}