import { useState, useSyncExternalStore } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../utils/auth';
import { useCart } from '../contexts/cart';
import { usePendingOrders } from '../hooks/usePendingOrders';
import { Logo } from './Logo';
import './AdminSidebar.css';

const STORAGE_KEY = 'stoqd.sidebar';
const WIDE = '(min-width: 861px)';

const subscribeWide = (onChange: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
/** Só no computador a barra é lateral; no telefone ela é uma faixa no topo. */
function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
}

/** A escolha de minimizar fica no navegador; sem armazenamento, vale o padrão. */
function readCollapsed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'min';
  } catch {
    return false;
  }
}

/**
 * Barra lateral da operação: a faixa mandacaru dos 20%. A página atual ganha
 * um bloco barro. Vitrine e sacola ficam num grupo à parte porque, para quem
 * atende, são o balcão — não uma tela de gestão.
 *
 * Minimizável: recolhida, sobra só a marca — a folhinha, o botão para voltar a
 * abrir e o nome na vertical. A escolha é lembrada entre visitas.
 */
export function AdminSidebar() {
  const navigate = useNavigate();
  const { itemCount } = useCart();
  const { orders } = usePendingOrders();
  const pending = orders.length;

  const wide = useWide();
  const [stored, setStored] = useState(readCollapsed);
  // No telefone a barra não minimiza, mesmo que a escolha guardada seja "min".
  const collapsed = stored && wide;

  const toggle = () => {
    const next = !stored;
    setStored(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'min' : 'max');
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  };

  const handleLogout = () => {
    clearToken();
    navigate('/');
    window.location.reload();
  };

  const item = (to: string, label: string, extra?: React.ReactNode, end = false) => (
    <NavLink to={to} end={end} className="side-link">
      {label}
      {extra}
    </NavLink>
  );

  return (
    <aside className={`admin-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="side-head">
        <Link to="/dashboard" className="side-logo" aria-label="stoqd, visão geral">
          <Logo size={28} onDark />
        </Link>
        <button
          type="button"
          className="side-toggle"
          aria-expanded={!collapsed}
          aria-controls="side-body"
          aria-label={collapsed ? 'Expandir o menu' : 'Minimizar o menu'}
          title={collapsed ? 'Expandir o menu' : 'Minimizar o menu'}
          onClick={toggle}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* O nome na vertical só aparece minimizado (o CSS decide); o leitor de
          tela já ouve "stoqd" no link da marca. */}
      <span className="side-rail-name" aria-hidden="true">stoqd</span>

      <div id="side-body" className="side-body">
        <nav aria-label="Administração" className="side-nav">
          <div className="side-group">
            <span className="side-group-label">Loja</span>
            {item('/dashboard', 'Visão geral')}
            {item('/estoque', 'Estoque')}
            {item('/vendas', 'Vendas', pending > 0 && (
              <span className="side-count" aria-label={`${pending} pedidos esperando`}>{pending}</span>
            ))}
            {item('/customers', 'Clientes')}
            {item('/ajustes', 'Ajustes')}
          </div>
          <div className="side-group">
            <span className="side-group-label">Balcão</span>
            {item('/', 'Vitrine', undefined, true)}
            {item('/checkout', 'Sacola', itemCount > 0 && <span className="side-count">{itemCount}</span>)}
          </div>
        </nav>

        <div className="side-footer">
          <span className="side-footer-label">Conectado como</span>
          <span className="side-footer-name">Administração</span>
          <button type="button" onClick={handleLogout} className="side-logout">Sair</button>
        </div>
      </div>
    </aside>
  );
}
