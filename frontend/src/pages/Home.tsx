import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useShowcase } from '../hooks/useShowcase';
import { useCart } from '../contexts/cart';
import { isAdmin } from '../utils/auth';
import { formatCurrency } from '../utils/formatters';
import './Home.css';

export function Home() {
  const { products, loading } = useShowcase();
  const { items, addItem } = useCart();

  // A vitrine virou a única superfície de escolher produto — do visitante e de
  // quem atende. Por isso ela mostra números diferentes para cada um.
  const admin = isAdmin();
  const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

  const brands = useMemo(() => {
    return ['Todas', ...Array.from(new Set(products.map(p => p.brand?.name).filter(Boolean)))];
  }, [products]);

  const categories = useMemo(() => {
    return ['Todas', ...Array.from(new Set(products.map(p => p.category?.name).filter(Boolean)))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchBrand = selectedBrand === 'Todas' || p.brand?.name === selectedBrand;
      const matchCategory = selectedCategory === 'Todas' || p.category?.name === selectedCategory;
      const matchSearch = !searchQuery || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.brand?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchBrand && matchCategory && matchSearch;
    });
  }, [products, selectedBrand, selectedCategory, searchQuery]);

  if (loading) return <div className="loading-state">Carregando vitrine...</div>;

  return (
    <div className="home-container">
      <main className="home-content">
        <section className="brands-filter">
          <span className="filter-label">MARCAS</span>
          <div className="filter-buttons">
            {brands.map(brand => (
              <button 
                key={brand as string}
                className={`btn-filter ${selectedBrand === brand ? 'active' : ''}`}
                onClick={() => setSelectedBrand(brand as string)}
              >
                {brand as string}
              </button>
            ))}
          </div>
        </section>

        {categories.length > 1 && (
          <section className="brands-filter">
            <span className="filter-label">CATEGORIAS</span>
            <div className="filter-buttons">
              {categories.map(category => (
                <button
                  key={category as string}
                  className={`btn-filter ${selectedCategory === category ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category as string)}
                >
                  {category as string}
                </button>
              ))}
            </div>
          </section>
        )}

        <h2 className="page-title">
          Produtos ({filteredProducts.length}) {searchQuery && `- Buscando por "${searchQuery}"`}
        </h2>

        <div className="products-grid">
          {filteredProducts.map(product => {
            const inCart = items.find(item => item.productId === product.id)?.quantity ?? 0;

            // Para o visitante vale o disponível: o que outra pessoa reservou
            // não é dele. Para o balcão vale o físico — quem está com o produto
            // na mão vende (decisão D2), e a reserva vira só um aviso.
            const sellable = admin ? product.quantity : product.available;
            const reserved = product.quantity - product.available;
            const soldOut = sellable - inCart < 1;

            return (
              <div key={product.id} className="product-card base-card">
                <div className="product-image-container">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={`Imagem de ${product.name}`} 
                      className="product-image" 
                    />
                  ) : (
                    <div className="product-image-placeholder">📦</div>
                  )}
                </div>
                <div className="product-info">
                  <h3>{product.name}</h3>
                  <span className={`badge ${sellable > 0 ? 'badge-success' : 'badge-danger'}`}>
                    {sellable < 1
                      ? 'Esgotado'
                      : admin && reserved > 0
                        ? `${product.quantity} un · ${reserved} reservada(s)`
                        : `${sellable} disponível(is)`}
                  </span>
                  <span className="product-price">{formatCurrency(product.activePrice)}</span>

                  <button
                    type="button"
                    className="btn-add-to-cart"
                    disabled={soldOut}
                    onClick={() => addItem(product)}
                  >
                    {soldOut
                      ? (inCart > 0 ? `${inCart} no carrinho` : 'Esgotado')
                      : (inCart > 0 ? `Adicionar (${inCart} no carrinho)` : 'Adicionar ao carrinho')}
                  </button>
                </div>
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
             <div style={{ color: 'var(--text-dim)', marginTop: '2rem' }}>Nenhum produto encontrado.</div>
          )}
        </div>
      </main>
    </div>
  );
}