import { useMemo, useState } from 'react';
import { api } from '../api';
import { getApiErrorMessage } from '../utils/errors';
import { useCustomers, type Customer } from '../hooks/useCustomers';
import { formatCurrency } from '../utils/formatters';
import { CustomerModal } from '../components/CustomerModal';
import { CustomerStatementPanel } from '../components/CustomerStatementPanel';
import './Customers.css';

export function Customers() {
  const { customers, loading, refetchCustomers } = useCustomers();
  // Esqueleto só na primeira carga; recarregar depois de salvar não pisca a tela.
  const firstLoad = loading && customers.length === 0;
  
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  // O extrato fica ao lado da lista. Sem escolha, mostra o primeiro cliente que
  // tem parcela atrasada (ou o primeiro da lista); "fechar" recolhe o painel.
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  // O lápis troca o extrato pelos campos de edição, no mesmo painel.
  const [editing, setEditing] = useState(false);

  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  // Quem decide se dá para apagar é o servidor: a lista traz `pendingSalesCount`,
  // que conta só as vendas com parcela em aberto — um cliente com tudo pago
  // aparece com zero e ainda assim tem histórico. Por isso a tela só nomeia a
  // pessoa e avisa da regra; a recusa, com o motivo, vem na resposta.
  const handleDelete = async (customer: Customer) => {
    const confirmed = confirm(
      `Apagar o cadastro de ${customer.name}?\n\n` +
      "Clientes com venda registrada não podem ser apagados — nesse caso nada será alterado."
    );

    if (confirmed) {
      try {
        await api.delete(`/customers/${customer.id}`);
        refetchCustomers();
      } catch (err) { alert(getApiErrorMessage(err, "Erro ao excluir cliente.")); }
    }
  };

  const startEditing = (customer: Customer) => {
    setPickedId(customer.id);
    setPanelOpen(true);
    setEditing(true);
  };

  const selectCustomer = (id: number) => {
    setPickedId(id);
    setPanelOpen(true);
    setEditing(false);
  };

  const defaultId = (filteredCustomers.find(c => c.hasOverdue) ?? filteredCustomers[0])?.id ?? null;
  const selectedId = filteredCustomers.some(c => c.id === pickedId) ? pickedId : defaultId;
  const selectedCustomer = customers.find(c => c.id === selectedId) ?? null;
  const showPanel = panelOpen && selectedId !== null;

  const summary = useMemo(() => ({
    total: customers.length,
    open: customers.filter(c => (c.pendingSalesCount || 0) > 0).length,
    receivable: customers.reduce((sum, c) => sum + (Number(c.totalDebt) || 0), 0),
    overdue: customers.filter(c => c.hasOverdue).length,
  }), [customers]);

  return (
    <div className="cu">
      <header className="cu-head">
        <div className="cu-head-text">
          <span className="cu-kicker">Operação · caderneta</span>
          <h1 className="cu-title">Clientes</h1>
        </div>
        <div className="cu-actions">
          <div className="input-with-icon cu-search">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              aria-label="Buscar cliente pelo nome"
              placeholder="Buscar pelo nome"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="cu-new" onClick={() => { setCustomerToEdit(null); setIsModalOpen(true); }}>
            + Novo cliente
          </button>
        </div>
      </header>

      <div className="cu-summary">
        <div className="cu-stat">
          <span className="cu-label">Clientes</span>
          {firstLoad ? <span className="skeleton cu-sk-stat" /> : <strong className="cu-stat-value">{summary.total}</strong>}
        </div>
        <div className="cu-stat">
          <span className="cu-label">Com conta aberta</span>
          {firstLoad ? <span className="skeleton cu-sk-stat" /> : <strong className="cu-stat-value">{summary.open}</strong>}
        </div>
        <div className="cu-stat">
          <span className="cu-label">A receber</span>
          {firstLoad ? <span className="skeleton cu-sk-stat" /> : <strong className="cu-stat-value">{formatCurrency(summary.receivable)}</strong>}
        </div>
        <div className="cu-stat">
          <span className="cu-label">Em atraso</span>
          {firstLoad ? <span className="skeleton cu-sk-stat" /> : (
            <strong className={`cu-stat-value ${summary.overdue > 0 ? 'cu-bad' : ''}`}>
              {summary.overdue} {summary.overdue === 1 ? 'cliente' : 'clientes'}
            </strong>
          )}
        </div>
      </div>

      <div className={`cu-body ${showPanel ? 'has-panel' : ''}`}>
      <div className="cu-table-wrap">
        <table className="cu-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Pendências</th>
              <th scope="col" className="num">Deve</th>
              <th scope="col" className="num"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody aria-busy={firstLoad}>
            {firstLoad ? (
              [0, 1, 2, 3, 4, 5].map(i => (
                <tr key={i} aria-hidden="true">
                  <td><span className="skeleton cu-sk-line" style={{ width: `${150 + (i % 3) * 30}px` }} /></td>
                  <td><span className="skeleton cu-sk-line" style={{ width: 80 }} /></td>
                  <td className="num"><span className="skeleton cu-sk-line" style={{ width: 70 }} /></td>
                  <td className="num"><span className="skeleton cu-sk-line" style={{ width: 56 }} /></td>
                </tr>
              ))
            ) : filteredCustomers.length > 0 ? (
              filteredCustomers.map(c => {
                // A API já devolve dívida, compras em aberto e atraso calculados.
                const pendingSalesCount = c.pendingSalesCount || 0;
                const isOverdue = c.hasOverdue;
                const totalDebt = Number(c.totalDebt) || 0;
                const tone = isOverdue ? 'late' : pendingSalesCount > 0 ? 'open' : 'ok';

                return (
                  <tr
                    key={c.id}
                    className={`cu-row cu-row-${tone} ${showPanel && c.id === selectedId ? 'is-selected' : ''}`}
                    onClick={() => selectCustomer(c.id)}
                  >
                    <td>
                      <button type="button" className="cu-open" aria-pressed={showPanel && c.id === selectedId}>
                        <strong>{c.name}</strong>
                        <span>{c.phone || c.email || 'Sem contato'}</span>
                      </button>
                    </td>
                    <td>
                      <span className={`cu-pending cu-pending-${tone}`}>
                        <span className="cu-dot" aria-hidden="true" />
                        {isOverdue
                          ? 'Parcela atrasada'
                          : pendingSalesCount > 0
                            ? `${pendingSalesCount} ${pendingSalesCount === 1 ? 'compra ativa' : 'compras ativas'}`
                            : 'Em dia'}
                      </span>
                    </td>
                    <td className={`num cu-debt ${isOverdue ? 'cu-bad' : ''}`}>
                      {totalDebt > 0 ? formatCurrency(totalDebt) : '—'}
                    </td>
                    <td className="num">
                      <div className="cu-row-actions">
                        <button type="button" className="cu-icon" aria-label={`Editar ${c.name}`} title="Editar" onClick={e => { e.stopPropagation(); startEditing(c); }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button type="button" className="cu-icon cu-remove" aria-label={`Remover ${c.name}`} title="Remover" onClick={e => { e.stopPropagation(); handleDelete(c); }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={4} className="cu-empty">Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showPanel && (
        <CustomerStatementPanel
          customerId={selectedId}
          name={selectedCustomer?.name}
          contact={selectedCustomer ? (selectedCustomer.phone || selectedCustomer.email || 'Sem contato') : undefined}
          editing={editing && selectedCustomer
            ? { customer: selectedCustomer, onCancel: () => setEditing(false), onSaved: () => { setEditing(false); refetchCustomers(); } }
            : undefined}
          onEdit={selectedCustomer ? () => startEditing(selectedCustomer) : undefined}
          onClose={() => setPanelOpen(false)}
          onRefresh={refetchCustomers}
        />
      )}
      </div>

      {isModalOpen && (
        <CustomerModal customerToEdit={customerToEdit} onClose={() => { setIsModalOpen(false); setCustomerToEdit(null); }} onSuccess={() => refetchCustomers()} />
      )}
    </div>
  );
}