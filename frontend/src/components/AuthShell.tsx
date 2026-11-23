import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/cart';
import { useCountdown, formatCountdown } from '../hooks/useCountdown';
import { Logo } from './Logo';
import './AuthShell.css';

/**
 * A tela de acesso: um painel verde à esquerda, com a razão de entrar, e o
 * formulário à direita. Entrar e Criar conta são as duas abas da mesma tela —
 * links entre `/login` e `/cadastro`, então a URL continua dizendo onde se
 * está e o `?next=` (para onde voltar depois) atravessa as duas.
 */
export function AuthShell({ mode, next, children }: {
  mode: 'login' | 'register';
  /** Para onde a pessoa volta depois de entrar; preservado entre as abas. */
  next?: string | null;
  children: ReactNode;
}) {
  const { items, expiresAt } = useCart();
  const secondsLeft = useCountdown(expiresAt);
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  const hasBag = items.length > 0;

  return (
    <div className="auth">
      <section className="auth-panel">
        <Link to="/" className="auth-logo" aria-label="stoqd, voltar à vitrine">
          <Logo size={36} onDark />
        </Link>

        <div className="auth-pitch">
          <span className="auth-kicker">{hasBag ? 'Sua sacola continua aqui' : 'Acesso à loja'}</span>
          <h1 className="auth-title">Entre e a reserva <em>vira meia hora.</em></h1>
          <p>
            Sem conta, a loja segura os produtos por cinco minutos. Com conta, por trinta —
            e o pedido chega com seu nome e telefone para a loja confirmar.
          </p>
        </div>

        {/* O que está em jogo, de verdade: a sacola e o tempo que resta dela. */}
        {hasBag && (
          <div className="auth-bag">
            <span>{items.length} {items.length === 1 ? 'produto' : 'produtos'} na sacola</span>
            {secondsLeft !== null && secondsLeft > 0 && (
              <>
                <span className="auth-bag-sep" aria-hidden="true" />
                <span className="auth-bag-time">{formatCountdown(secondsLeft)}</span>
              </>
            )}
          </div>
        )}
      </section>

      <main className="auth-main">
        <div className={`auth-box ${mode === 'register' ? 'auth-box-register' : ''}`}>
          <nav className="auth-tabs" aria-label="Acesso">
            <Link to={`/login${query}`} aria-current={mode === 'login' ? 'page' : undefined}>Entrar</Link>
            <Link to={`/cadastro${query}`} aria-current={mode === 'register' ? 'page' : undefined}>Criar conta</Link>
          </nav>

          {children}

          <Link to="/" className="auth-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Continuar olhando a vitrine
          </Link>
        </div>
      </main>
    </div>
  );
}
