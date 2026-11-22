import { useMemo, useState } from 'react';
import { deleteProduct } from '../services/catalog';
import { getApiErrorMessage } from '../utils/errors';
import { useToast } from '../contexts/toast';
import { useProducts, type Product } from '../hooks/useProducts';
import { formatCurrency } from '../utils/formatters';
import { ProductModal } from '../components/ProductModal';
import { getExpiryStatus, formatExpiryDate, daysUntilExpiry } from '../utils/expiry';
import { MONTH_LONG } from '../utils/dashboardMonth';
import './Inventory.css';

/** Até esta quantidade (e acima de zero) o produto aparece como "baixo". */
const LOW_STOCK = 3;

type Filter = 'all' | 'attention' | 'out';

const isOut = (p: Product) => Number(p.quantity) === 0;
const isLow = (p: Product) => Number(p.quantity) > 0 && Number(p.quantity) <= LOW_STOCK;
/** Pede atenção: acabou, está acabando ou a validade é curta ou já passou. */
const needsAttention = (p: Product) => {
  const expiry = getExpiryStatus(p.expiryDate);
  return isOut(p) || isLow(p) || expiry === 'soon' || expiry === 'expired';
};

export function Inventory() {
  const toast = useToast();
  const { products, loading, refetch: refetchProducts } = useProducts();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const handleDeleteProduct = async (id: number) => {
    if (confirm("Tem certeza que deseja apagar TODOS os itens deste produto?")) {
      try {
        await deleteProduct(id);
        refetchProducts();
      } catch (err) { toast.error(getApiErrorMessage(err, "Erro ao excluir produto.")); }
    }
  };

  const openEditModal = (product: Product) => {
    setProductToEdit(product);
    setIsModalOpen(true);
  };

  // Os totais do topo e os números dos filtros contam o estoque inteiro: não
  // mudam com a busca, para quem filtra saber quanto há de cada coisa.
  const counts = useMemo(() => ({
    all: products.length,
    attention: products.filter(needsAttention).length,
    out: products.filter(isOut).length,
  }), [products]);

  const totals = useMemo(() => {
    let value = 0;
    let profit = 0;
    for (const p of products) {
      const qty = Number(p.quantity) || 0;
      const cost = Number(p.averageCost) || 0;
      const sell = Number(p.activePrice ?? p.sellingPrice) || 0;
      value += qty * cost;
      profit += Number(p.totalExpectedProfit ?? (Number(p.unitProfit ?? sell - cost)) * qty);
    }
    return { value, profit };
  }, [products]);

  const filteredProducts = products.filter(p => {
    if (filter === 'attention' && !needsAttention(p)) return false;
    if (filter === 'out' && !isOut(p)) return false;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.brand?.name?.toLowerCase().includes(q);
  });

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'attention', label: 'Pedem atenção' },
    { id: 'out', label: 'Esgotados' },
  ];

  return (
    <div className="inv">
      <header className="inv-head">
        <span className="inv-kicker">Operação · {MONTH_LONG[new Date().getMonth()].toLowerCase()}</span>
        <h1 className="inv-title">Estoque</h1>
      </header>

      <div className="inv-summary">
        <div className="inv-stat">
          <span className="inv-label">Valor em estoque</span>
          <strong className="inv-stat-value">{formatCurrency(totals.value)}</strong>
        </div>
        <div className="inv-stat">
          <span className="inv-label">Lucro previsto</span>
          <strong className="inv-stat-value inv-good">{formatCurrency(totals.profit)}</strong>
        </div>
        <div className="inv-stat">
          <span className="inv-label">Pedem atenção</span>
          <strong className={`inv-stat-value ${counts.attention > 0 ? 'inv-bad' : ''}`}>{counts.attention}</strong>
        </div>
        <div className="inv-stat">
          <span className="inv-label">Esgotados</span>
          <strong className="inv-stat-value inv-muted">{counts.out}</strong>
        </div>
      </div>

      <div className="inv-toolbar">
        <div role="group" aria-label="Filtrar" className="inv-filters">
          {filters.map(f => (
            <button
              key={f.id}
              type="button"
              className="inv-filter"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label} · {counts[f.id]}
            </button>
          ))}
        </div>

        <div className="inv-actions">
          <div className="input-with-icon inv-search">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              aria-label="Buscar produto ou marca"
              placeholder="Buscar produto ou marca"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="inv-new" onClick={() => { setProductToEdit(null); setIsModalOpen(true); }}>
            + Novo produto
          </button>
        </div>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              <th scope="col">Produto</th>
              <th scope="col">Estoque</th>
              <th scope="col">Validade</th>
              <th scope="col" className="num">Custo</th>
              <th scope="col" className="num">Venda</th>
              <th scope="col" className="num">Margem</th>
              <th scope="col" className="num"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} aria-hidden="true">
                  <td><span className="skeleton" style={{ width: '70%', height: 22 }} /></td>
                  <td><span className="skeleton" style={{ width: 70, height: 30, borderRadius: 999 }} /></td>
                  <td><span className="skeleton skeleton-line" style={{ width: 90, height: 16 }} /></td>
                  <td><span className="skeleton skeleton-line" style={{ width: 60, height: 16, marginLeft: 'auto' }} /></td>
                  <td><span className="skeleton skeleton-line" style={{ width: 60, height: 16, marginLeft: 'auto' }} /></td>
                  <td><span className="skeleton skeleton-line" style={{ width: 60, height: 16, marginLeft: 'auto' }} /></td>
                  <td />
                </tr>
              ))
            ) : filteredProducts.map(p => {
              const custo = Number(p.averageCost) || 0;
              const venda = Number(p.activePrice ?? p.sellingPrice) || 0;
              const qtd = Number(p.quantity) || 0;
              // unitProfit já vem calculado da API.
              const lucroUnit = Number(p.unitProfit ?? venda - custo);
              const expiry = getExpiryStatus(p.expiryDate);
              const days = daysUntilExpiry(p.expiryDate);
              const emPromocao = p.promotionalPrice != null;

              const stockClass = qtd === 0 ? 'inv-pill-zero' : isLow(p) ? 'inv-pill-low' : 'inv-pill-ok';
              const stockText = qtd === 0 ? 'Esgotado' : isLow(p) ? `${qtd} un · baixo` : `${qtd} un`;

              return (
                <tr key={p.id}>
                  <td>
                    <div className="inv-product">
                      <strong>{p.name}</strong>
                      <span>
                        {p.brand?.name}
                        {p.category?.name && <> · {p.category.name}</>}
                      </span>
                    </div>
                  </td>
                  <td><span className={`inv-pill ${stockClass}`}>{stockText}</span></td>
                  <td>
                    {expiry === 'none' || !p.expiryDate ? (
                      <span className="inv-date inv-date-none">Sem validade</span>
                    ) : expiry === 'expired' ? (
                      <span className="inv-pill inv-pill-zero" title={formatExpiryDate(p.expiryDate)}>Vencido</span>
                    ) : expiry === 'soon' ? (
                      <span className="inv-pill inv-pill-low" title={formatExpiryDate(p.expiryDate)}>
                        {days === 0 ? 'Vence hoje' : `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`}
                      </span>
                    ) : (
                      <span className="inv-date">{formatExpiryDate(p.expiryDate)}</span>
                    )}
                  </td>
                  <td className="num inv-cost">{formatCurrency(custo)}</td>
                  <td className="num inv-sell">
                    {emPromocao ? (
                      <>
                        <s className="inv-was">{formatCurrency(p.sellingPrice)}</s>{' '}
                        <span className="inv-promo">{formatCurrency(venda)}</span>
                      </>
                    ) : formatCurrency(venda)}
                  </td>
                  <td className={`num inv-margin ${lucroUnit < 0 ? 'inv-bad' : 'inv-good'}`}>
                    {lucroUnit < 0 ? '' : '+'}{formatCurrency(lucroUnit)}
                  </td>
                  <td className="num">
                    <div className="inv-row-actions">
                      <button type="button" className="inv-edit" onClick={() => openEditModal(p)}>Editar</button>
                      <button type="button" className="inv-remove" aria-label={`Remover ${p.name}`} onClick={() => handleDeleteProduct(p.id)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filteredProducts.length === 0 && (
              <tr><td colSpan={7} className="inv-empty">Nenhum produto encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
