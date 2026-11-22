import { useState, useEffect, useCallback, useRef } from 'react';
import { updateCustomer, getCustomerStatement, payInstallment } from '../services/customers';
import { getApiErrorMessage } from '../utils/errors';
import { formatCurrency, formatDateCompact } from '../utils/formatters';
import type { Customer, CustomerStatement, Installment, StatementSale, StatementSaleItem } from '../hooks/useCustomers';
import './CustomerStatementPanel.css';

interface Props {
  customerId: number | null;
  /** Contato mostrado no cabeçalho; o extrato em si só traz o nome. */
  contact?: string;
  /** O nome já conhecido pela lista: aparece enquanto o extrato carrega. */
  name?: string;
  /**
   * Quando presente, o cabeçalho (nome e telefone) vira campos para editar, ali
   * mesmo, e o resto do extrato continua à vista embaixo.
   */
  editing?: { customer: Customer; onCancel: () => void; onSaved: () => void };
  /** Abre a edição; o lápis ao lado do nome chama isto. */
  onEdit?: () => void;
  onClose: () => void;
  onRefresh: () => void;
}

/**
 * O extrato de um cliente, num painel verde ao lado da lista: o que deve e o
 * que já comprou, a parcela mais atrasada com o botão de dar baixa, e cada
 * compra, que abre para as parcelas.
 */
/** O estado de uma parcela, para a cor: paga em dia, paga com atraso, atrasada ou a vencer. */
function installmentStatus(inst: Installment): 'paid' | 'paid-late' | 'overdue' | 'pending' {
  const due = new Date(inst.dueDate);
  due.setHours(0, 0, 0, 0);

  if (inst.paidAt) {
    const paid = new Date(inst.paidAt);
    paid.setHours(0, 0, 0, 0);
    return paid > due ? 'paid-late' : 'paid';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today ? 'overdue' : 'pending';
}

/**
 * O cabeçalho do extrato como formulário: nome e telefone em campos de fundo
 * mais escuro, o e-mail sob um "+ Adicionar e-mail" (aparece direto se o
 * cliente já tem um) e os botões Cancelar e Salvar.
 */
function EditHeader({ customer, onCancel, onSaved }: { customer: Customer; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: customer.name || '',
    phone: customer.phone || '',
    email: customer.email || '',
  });
  const [showEmail, setShowEmail] = useState(Boolean(customer.email));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await updateCustomer(customer.id, form);
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o cliente.'));
      setIsSaving(false);
    }
  };

  return (
    <form className="edit-header" onSubmit={save}>
      <span className="statement-kicker">Editar cadastro</span>

      <div className="edit-field">
        <label htmlFor="cli-nome">Nome completo</label>
        <input id="cli-nome" name="name" type="text" required autoFocus className="edit-name"
          value={form.name} placeholder="Fulano da Silva" onChange={change} />
      </div>
      <div className="edit-field">
        <label htmlFor="cli-fone">Telefone / WhatsApp</label>
        <input id="cli-fone" name="phone" type="text" required
          value={form.phone} placeholder="(12) 3456-7890" onChange={change} />
      </div>

      {showEmail ? (
        <div className="edit-field">
          <label htmlFor="cli-email">E-mail <span>(opcional)</span></label>
          <input id="cli-email" name="email" type="email" autoFocus={!customer.email}
            value={form.email} placeholder="exemplo@email.com" onChange={change} />
        </div>
      ) : (
        <button type="button" className="edit-add-email" onClick={() => setShowEmail(true)}>+ Adicionar e-mail</button>
      )}

      {error && <p className="edit-error" role="alert">{error}</p>}

      <div className="edit-actions">
        <button type="button" className="edit-cancel" onClick={onCancel} disabled={isSaving}>Cancelar</button>
        <button type="submit" className="edit-save" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </form>
  );
}

export function CustomerStatementPanel({ customerId, contact, name, editing, onEdit, onClose, onRefresh }: Props) {
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
      const res = await getCustomerStatement<CustomerStatement>(customerId);
      setActiveCustomer(res.data);

      // As compras chegam fechadas: com várias, abrir todas escondia a que se
      // procura. Quem quer dar baixa abre a compra pelo cabeçalho, que já
      // mostra, nos quadradinhos, qual tem parcela atrasada ou a vencer.
      setExpandedSales([]);
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
      await payInstallment(installmentId);
      await loadStatement();
      onRefresh();
    } catch (err) {
      alert(getApiErrorMessage(err, 'Erro ao processar a baixa da parcela.'));
    }
  };

  const sortedSales = [...(activeCustomer?.sales || [])].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Quanto deve (parcelas em aberto), quanto já comprou e a parcela mais antiga
  // em atraso — a que a loja precisa cobrar primeiro.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allInstallments = sortedSales.flatMap(sale => (sale.installments || []).map(inst => ({ inst, sale })));
  const owed = allInstallments.filter(({ inst }) => !inst.paidAt).reduce((sum, { inst }) => sum + Number(inst.value), 0);
  const bought = sortedSales.reduce((sum, sale) => sum + sale.total, 0);
  const overdue = allInstallments
    .filter(({ inst }) => !inst.paidAt && new Date(inst.dueDate) < today)
    .sort((a, b) => new Date(a.inst.dueDate).getTime() - new Date(b.inst.dueDate).getTime())[0];
  const overdueNumber = overdue
    ? [...overdue.sale.installments].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).findIndex(i => i.id === overdue.inst.id) + 1
    : 0;

  return (
    <section className="statement-panel" aria-labelledby="extrato-titulo">
      <div className="statement-modal">

        {editing ? (
          <EditHeader key={editing.customer.id} {...editing} />
        ) : (
          <div className="statement-header">
            <div className="statement-title">
              <span className="statement-kicker">Extrato</span>
              <div className="statement-name-row">
                <h2 id="extrato-titulo">{activeCustomer?.name ?? name ?? ''}</h2>
                {onEdit && (
                  <button type="button" className="statement-edit" aria-label="Editar cadastro" title="Editar" onClick={onEdit}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                )}
              </div>
              {contact && <span className="statement-contact">{contact}</span>}
            </div>
            <button type="button" className="btn-secondary statement-close" aria-label="Fechar extrato" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        )}

        {!loading && activeCustomer && (
          <>
            <div className="statement-totals">
              <div><span>Deve no total</span><strong>{formatCurrency(owed)}</strong></div>
              <div><span>Já comprou</span><strong>{formatCurrency(bought)}</strong></div>
            </div>

            {overdue && (
              <div className="statement-overdue">
                <span>
                  <strong>Parcela {overdueNumber} de {overdue.sale.installments.length} · venda {String(overdue.sale.id).padStart(4, '0')}</strong>
                  <span>Venceu em {formatDateCompact(overdue.inst.dueDate)} · {formatCurrency(Number(overdue.inst.value))}</span>
                </span>
                <button type="button" className="statement-pay" onClick={() => handlePay(overdue.inst.id)}>Dar baixa</button>
              </div>
            )}
          </>
        )}

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
                  
                  <div
                    className="sale-accordion-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => toggleSale(sale.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSale(sale.id); } }}
                  >
                    <div className="sale-info-left">
                      <h4>Venda #{sale.id} - {formatDateCompact(sale.date)}</h4>
                      <span className="sale-products-label" title={productNames}>{productNames}</span>
                      {sortedInstallments.length > 1 && (
                        <span className="sale-mini" aria-hidden="true">
                          {sortedInstallments.map(inst => <span key={inst.id} className={`sale-mini-square ${installmentStatus(inst)}`} />)}
                        </span>
                      )}
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
                                  <span className="inst-date">Vence: {formatDateCompact(inst.dueDate)}</span>
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
    </section>
  );
}