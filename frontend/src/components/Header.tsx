import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getRole, clearToken } from '../utils/auth';
import { useCart } from '../contexts/cart';
import './Header.css';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { itemCount } = useCart();
  const isHome = location.pathname === '/';

  const role = getRole();
  const isAdmin = role === 'admin';
  const isCustomer = role === 'customer';

  const searchQuery = searchParams.get('q') || '';

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      navigate(`/?q=${encodeURIComponent(value)}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleLogout = () => {
    clearToken();
    navigate('/');
    window.location.reload(); 
  };

  // A vitrine deixa de ser só um link da marca: dentro do carrinho, voltar a
  // escolher produtos é a segunda coisa mais provável depois de finalizar.
  const showcaseLink = (
    <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
      <span className="nav-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
        </svg>
      </span>
      <span className="nav-text">Vitrine</span>
    </Link>
  );

  // O carrinho aparece para todo mundo — inclusive para quem não entrou, que é
  // justamente quem precisa vê-lo para decidir criar conta.
  const cartLink = (
    <Link to="/checkout" className={`nav-link nav-cart ${location.pathname === '/checkout' ? 'active' : ''}`} title="Carrinho">
      <span className="nav-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
      </span>
      <span className="nav-text">Carrinho</span>
    </Link>
  );

  return (
    <header className="global-header">
      <div className="header-content">
        
        <Link to="/" className="brand-area">
          <span className="brand-symbol">▲</span>
          <h1 className="brand-name">stoqd</h1>
        </Link>

        <div className="header-center">
          {isHome && (
            <div className="header-search-wrapper">
              <div className="input-with-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  placeholder="Buscar na vitrine..." 
                  value={searchQuery}
                  onChange={handleSearch}
                />
              </div>
            </div>
          )}
        </div>

        <nav className="header-nav">
          
          {!isAdmin && showcaseLink}
          {!isAdmin && cartLink}

          {isCustomer && (
            <>
              <Link to="/minha-conta" className={`nav-link ${location.pathname === '/minha-conta' ? 'active' : ''}`}>
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </span>
                <span className="nav-text">Minha conta</span>
              </Link>

              <button onClick={handleLogout} className="nav-link btn-logout" title="Sair">
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                </span>
              </button>
            </>
          )}

          {isAdmin && (
            <>
              {showcaseLink}
              {cartLink}


              <Link to="/vendas" className={`nav-link ${location.pathname === '/vendas' ? 'active' : ''}`}>
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                </span>
                <span className="nav-text">Vendas</span>
              </Link>

              <Link to="/customers" className={`nav-link ${location.pathname === '/customers' ? 'active' : ''}`}>
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </span>
                <span className="nav-text">Clientes</span>
              </Link>

              <Link to="/estoque" className={`nav-link ${location.pathname === '/estoque' ? 'active' : ''}`}>
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                </span>
                <span className="nav-text">Estoque</span>
              </Link>

              <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                </span>
                <span className="nav-text">Dashboard</span>
              </Link>

              <Link to="/ajustes" className={`nav-link ${location.pathname === '/ajustes' ? 'active' : ''}`}>
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </span>
                <span className="nav-text">Ajustes</span>
              </Link>

              <button onClick={handleLogout} className="nav-link btn-logout" title="Sair do sistema">
                <span className="nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                </span>
              </button>
            </>
          )}

          {!role && location.pathname !== '/login' && (
             <Link to="/login" className="nav-link" style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>
               Entrar
             </Link>
          )}
        </nav>
      </div>
    </header>
  );
}