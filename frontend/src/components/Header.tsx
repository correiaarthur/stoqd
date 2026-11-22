import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getRole, clearToken } from '../utils/auth';
import { useCart } from '../contexts/cart';
import { Logo } from './Logo';
import { ShowcaseToolbar } from './ShowcaseToolbar';
import { BagPreview } from './BagPreview';
import { AccountMenu } from './AccountMenu';
import './Header.css';

/**
 * Cabeçalho da loja — de quem está comprando. A operação usa a barra lateral
 * (`AdminSidebar`), então aqui só há visitante e cliente.
 *
 * Na vitrine é uma faixa só, grudada no topo: marca, busca, filtros, sacola e
 * conta. Nas outras telas é só marca, vitrine, conta e sacola, porque ali a
 * pessoa já está numa tarefa.
 */
export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { itemCount } = useCart();
  const isCustomer = getRole() === 'customer';
  const isHome = location.pathname === '/';

  const handleLogout = () => {
    clearToken();
    navigate('/');
    window.location.reload();
  };

  // A sacola leva à sacola; com o mouse em cima (ou foco de teclado), mostra
  // antes o que tem nela.
  const bag = (
    <BagPreview>
    <Link to="/checkout" className="bag-link" aria-label={`Sacola, ${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`}>
      <svg className="bag-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" />
      </svg>
      <span className="bag-label">Sacola</span>
      <span className="bag-count">({itemCount})</span>
    </Link>
    </BagPreview>
  );

  const account = isCustomer ? (
    <AccountMenu onLogout={handleLogout} />
  ) : (
    location.pathname !== '/login' && (
      <span className="account-links"><Link to="/login">Entrar na conta</Link></span>
    )
  );

  if (isHome) {
    // Uma faixa só, grudada no topo: marca, busca, filtros, sacola e conta.
    return (
      <header className="store-bar is-sticky">
        <div className="store-bar-inner">
          <Link to="/" className="store-bar-logo" aria-label="stoqd, página inicial">
            <Logo size={30} />
          </Link>
          <ShowcaseToolbar className="store-bar-toolbar" trailing={bag} />
          <div className="store-bar-account">{account}</div>
        </div>
      </header>
    );
  }

  return (
    <header className="store-bar">
      <div className="compact-header">
        <Link to="/" className="compact-logo" aria-label="stoqd, página inicial">
          <Logo size={30} />
        </Link>
        <nav aria-label="Loja" className="compact-nav">
          <NavLink to="/" end>Vitrine</NavLink>
          {bag}
          {account}
        </nav>
      </div>
    </header>
  );
}
