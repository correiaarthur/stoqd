import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './AccountMenu.css';

/**
 * O ícone de perfil do cabeçalho: um botão que abre "Meu perfil" e "Sair".
 * Fecha com Esc, com clique fora ou ao escolher; o foco volta ao botão.
 */
export function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className="account-menu"
      ref={root}
      // Com o mouse, abre ao passar por cima — sem pressa para fechar, para dar
      // tempo de atravessar do botão à lista.
      onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setOpen(true); }}
      onMouseLeave={() => { hoverTimer.current = setTimeout(() => setOpen(false), 160); }}
    >
      <button
        ref={trigger}
        type="button"
        className="account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Minha conta"
        onClick={() => setOpen(value => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </svg>
      </button>

      {open && (
        <div className="account-menu-list" role="menu">
          <Link to="/minha-conta" role="menuitem" className="account-menu-item" onClick={() => setOpen(false)}>
            Meu perfil
          </Link>
          <button type="button" role="menuitem" className="account-menu-item is-exit" onClick={() => { setOpen(false); onLogout(); }}>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
