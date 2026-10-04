import { useState } from 'react';
import { api } from '../api';
import { getApiErrorMessage } from '../utils/errors';
import { useCustomers, type Customer } from '../hooks/useCustomers';
import { formatCurrency } from '../utils/formatters';
import { CustomerModal } from '../components/CustomerModal';
import { CustomerStatementModal } from '../components/CustomerStatementModal';
import './Customers.css';

export function Customers() {
  const { customers, refetchCustomers } = useCustomers();
  
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

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

  const openEditModal = (customer: Customer) => {
    setCustomerToEdit(customer);
    setIsModalOpen(true);
  };

  return (
    <div className="page-container">
      <div className="customers-header" style={{ marginBottom: '2rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Clientes</h1>
      </div>

      <section className="page-card base-card">
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, maxWidth: '400px' }}>
            <div className="input-with-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                placeholder="Buscar cliente pelo nome..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <button className="btn-primary" onClick={() => { setCustomerToEdit(null); setIsModalOpen(true); }} style={{ whiteSpace: 'nowrap' }}>
            + Novo Cliente
          </button>

        </div>

        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Nome</th><th>Contato</th><th>Pendências</th><th className="highlight-col">Deve</th><th>Ações</th></tr></thead>
            <tbody>
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map(c => {
                  // A API já devolve dívida, compras em aberto e atraso calculados.
                  const pendingSalesCount = c.pendingSalesCount || 0;
                  const isOverdue = c.hasOverdue;
                  const totalDebt = Number(c.totalDebt) || 0;

                  return (
                    <tr key={c.id} onClick={() => setSelectedCustomerId(c.id)} className={`customer-row ${isOverdue ? 'is-overdue' : ''}`}>
                      <td><strong>{c.name}</strong></td>
                      <td>
                        {c.phone || c.email ? (
                          <>
                            {c.phone}
                            {c.phone && c.email && <br />}
                            {c.email && <small className="text-dim">{c.email}</small>}
                          </>
                        ) : <span className="text-dim">Sem contato</span>}
                      </td>
                      <td>
                        <span className={`pending-count ${pendingSalesCount > 0 ? 'active' : 'inactive'}`}>
                          {pendingSalesCount} {pendingSalesCount === 1 ? 'compra ativa' : 'compras ativas'}
                        </span>
                      </td>
                      <td className="highlight-cell">
                        {totalDebt > 0
                          ? <strong className={isOverdue ? 'text-danger' : ''}>{formatCurrency(totalDebt)}</strong>
                          : <span className="text-dim">—</span>}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn-edit-text" onClick={(e) => { e.stopPropagation(); openEditModal(c); }}>Editar</button>
                          <button className="btn-delete-text" onClick={(e) => { e.stopPropagation(); handleDelete(c); }}>Remover</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={5} className="empty-state">Nenhum cliente encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <CustomerModal customerToEdit={customerToEdit} onClose={() => { setIsModalOpen(false); setCustomerToEdit(null); }} onSuccess={() => refetchCustomers()} />
      )}
      <CustomerStatementModal customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(null)} onRefresh={refetchCustomers} />
    </div>
  );
}