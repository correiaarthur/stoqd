import { useState } from 'react';
import { api } from '../api';
import { getApiErrorMessage } from '../utils/errors';
import { useProducts, type Product } from '../hooks/useProducts';
import { formatCurrency } from '../utils/formatters';
import { ProductModal } from '../components/ProductModal';
import { getExpiryStatus, formatExpiryDate } from '../utils/expiry';
import './Inventory.css';

export function Inventory() {
  const { products, loading, refetch: refetchProducts } = useProducts();
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const handleDeleteProduct = async (id: number) => {
    if (confirm("Tem certeza que deseja apagar TODOS os itens deste produto?")) {
      try {
        await api.delete(`/products/${id}`);
        refetchProducts();
      } catch (err) { alert(getApiErrorMessage(err, "Erro ao excluir produto.")); }
    }
  };

  const openEditModal = (product: Product) => {
    setProductToEdit(product);
    setIsModalOpen(true);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.brand?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Gestão de Estoque</h1>
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
                placeholder="Buscar produto ou marca..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <button className="btn-primary" onClick={() => { setProductToEdit(null); setIsModalOpen(true); }} style={{ whiteSpace: 'nowrap' }}>
            + Novo Produto
          </button>

        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Estoque</th>
                <th>Validade</th>
                <th>Custo Unit.</th>
                <th>Venda Unit.</th>
                <th>Lucro Unit.</th>
                <th className="highlight-col">Lucro Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Carregando estoque...</td></tr>
              ) : filteredProducts.map(p => {
                const custo = Number(p.averageCost) || 0;
                const venda = Number(p.activePrice ?? p.sellingPrice) || 0;
                const qtd = Number(p.quantity) || 0;
                // unitProfit e totalExpectedProfit já vêm calculados da API.
                const lucroUnit = Number(p.unitProfit ?? venda - custo);
                const lucroTotal = Number(p.totalExpectedProfit ?? lucroUnit * qtd);
                const expiry = getExpiryStatus(p.expiryDate);
                const emPromocao = p.promotionalPrice != null;

                return (
                  <tr key={p.id}>
                    <td>
                      <div className="product-cell">
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt="" className="product-thumb" loading="lazy" />
                          : <div className="product-thumb product-thumb-empty">📦</div>}
                        <div>
                          <strong>{p.name}</strong>
                          <br />
                          <small className="text-dim">
                            {p.brand?.name}
                            {p.category?.name && <> · {p.category.name}</>}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${qtd === 0 ? 'badge-danger' : 'badge-success'}`}>{qtd === 0 ? 'Esgotado' : `${qtd} un`}</span></td>
                    <td>
                      {/* `expiry === 'none'` já significa data ausente; testar
                          o campo direto é o que faz o tipo estreitar. */}
                      {expiry === 'none' || !p.expiryDate
                        ? <span className="text-dim">—</span>
                        : (
                          <span className={`badge badge-expiry-${expiry}`} title={formatExpiryDate(p.expiryDate)}>
                            {expiry === 'expired' ? 'Vencido' : expiry === 'soon' ? 'Vence em breve' : formatExpiryDate(p.expiryDate)}
                          </span>
                        )}
                    </td>
                    <td className="text-dim">{formatCurrency(custo)}</td>
                    <td>
                      {emPromocao ? (
                        <>
                          <s className="text-dim">{formatCurrency(p.sellingPrice)}</s>{' '}
                          <strong className="text-promo">{formatCurrency(venda)}</strong>
                        </>
                      ) : formatCurrency(venda)}
                    </td>
                    <td className={lucroUnit < 0 ? 'text-danger' : 'text-success'}>
                      {lucroUnit < 0 ? '' : '+'}{formatCurrency(lucroUnit)}
                    </td>
                    <td className={`highlight-cell ${lucroTotal < 0 ? 'text-danger' : 'text-success'}`}>
                      <strong>{formatCurrency(lucroTotal)}</strong>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-edit-text" onClick={() => openEditModal(p)}>Editar</button>
                        <button className="btn-delete-text" onClick={() => handleDeleteProduct(p.id)}>Remover</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredProducts.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <ProductModal 
          productToEdit={productToEdit}
          existingProducts={products}
          onClose={() => { setIsModalOpen(false); setProductToEdit(null); }}
          onSuccess={refetchProducts}
        />
      )}
    </div>
  );
}