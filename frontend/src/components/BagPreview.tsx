import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../contexts/cart';
import { useCountdown, formatCountdown } from '../hooks/useCountdown';
import { formatCurrency } from '../utils/formatters';
import { toneFor } from '../utils/shelfTone';
import { isAdmin } from '../utils/auth';
import { markMoreBelow } from '../utils/scrollFade';
import './BagPreview.css';

/** Espera antes de abrir: passar o mouse de raspão não deve abrir nada. */
const OPEN_DELAY_MS = 120;
/** Espera antes de fechar: dá tempo de levar o mouse da sacola até a lista. */
const CLOSE_DELAY_MS = 220;

/**
 * Prévia da sacola ao passar o mouse (ou focar pelo teclado) no botão
 * "Sacola": o que está nela, quanto deu e quanto tempo de reserva resta, com o
 * botão de ir para a sacola no fim.
 *
 * Só aparece quando há o que mostrar, e não na própria tela da sacola. No
 * toque não há hover: tocar no botão leva direto à sacola, como sempre.
 */
export function BagPreview({ children }: { children: ReactNode }) {
  const { items, total, itemCount, expiresAt, availability, setQuantity, removeItem } = useCart();
  const location = useLocation();
  const secondsLeft = useCountdown(expiresAt);
  // Guarda em que página a prévia foi aberta: navegar (inclusive pelo botão
  // dela) muda a página e a prévia some sozinha, sem efeito para fechá-la.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // O mouse está em cima? Um botão que se desliga com o foco (o "+" que chega
  // ao limite de estoque) solta o foco sozinho — isso não pode fechar a
  // prévia de quem ainda está com o mouse nela.
  const pointerInside = useRef(false);
  const panelId = useId();

  const enabled = items.length > 0 && location.pathname !== '/checkout';

  const schedule = (next: boolean, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    const path = location.pathname;
    timer.current = setTimeout(() => setOpenOn(next ? path : null), delay);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const showing = enabled && openOn === location.pathname;

  // A lista cortada ganha o desfoque da base enquanto há mais para rolar.
  const listRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    if (showing) markMoreBelow(listRef.current);
  }, [showing, items.length]);

  return (
    <div
      ref={rootRef}
      className={`bag-preview ${showing ? 'is-open' : ''}`}
      onPointerEnter={e => {
        if (e.pointerType !== 'mouse') return;
        pointerInside.current = true;
        schedule(true, OPEN_DELAY_MS);
      }}
      onPointerLeave={e => {
        if (e.pointerType !== 'mouse') return;
        pointerInside.current = false;
        schedule(false, CLOSE_DELAY_MS);
      }}
      onFocus={() => schedule(true, 0)}
      onBlur={e => {
        if (pointerInside.current) return;
        if (!rootRef.current?.contains(e.relatedTarget as Node)) schedule(false, 0);
      }}
      onKeyDown={e => {
        if (e.key === 'Escape' && showing) {
          setOpenOn(null);
          rootRef.current?.querySelector<HTMLElement>('.bag-link')?.focus();
        }
      }}
    >
      {children}

      {showing && (
        <div id={panelId} className="bag-panel" role="region" aria-label="Prévia da sacola">
          <div className="bag-panel-head">
            <span className="bag-panel-title">
              Na sacola <em>· {itemCount} {itemCount === 1 ? 'item' : 'itens'}</em>
            </span>
            {secondsLeft !== null && secondsLeft > 0 && !isAdmin() && (
              <span className="bag-panel-timer">reservado por {formatCountdown(secondsLeft)}</span>
            )}
          </div>

          <ul className="bag-panel-list" ref={listRef} onScroll={e => markMoreBelow(e.currentTarget)}>
            {items.map(item => (
              <li key={item.productId} className="bag-panel-item">
                <span className="bag-panel-thumb" style={{ background: toneFor(item.productId) }} aria-hidden="true">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <svg width="12" height="24" viewBox="0 0 40 80" fill="none" stroke="var(--papel)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="15" y="4" width="10" height="10" rx="2" />
                      <path d="M16 14v6c-6 2-9 6-9 12v38a6 6 0 0 0 6 6h14a6 6 0 0 0 6-6V32c0-6-3-10-9-12v-6" />
                    </svg>
                  )}
                </span>
                <span className="bag-panel-name">{item.name}</span>
                <strong className="bag-panel-sub">{formatCurrency(item.unitPrice * item.quantity)}</strong>

                <span className="bag-panel-qty">
                  {/* O "+" vai até o que está disponível para esta pessoa (já
                      descontado o que outros reservaram). Enquanto o servidor
                      não respondeu, não trava: ele confere de novo no envio. */}
                  <span className="bag-stepper" role="group" aria-label={`Quantidade de ${item.name}`}>
                    <button
                      type="button"
                      aria-label={`Diminuir ${item.name}`}
                      disabled={item.quantity <= 1}
                      onClick={() => setQuantity(item.productId, item.quantity - 1)}
                    >−</button>
                    <span className="bag-stepper-value" aria-live="polite">{item.quantity}</span>
                    {(() => {
                      const left = availability[item.productId]?.available;
                      const atMax = left !== undefined && item.quantity >= left;
                      return (
                        <button
                          type="button"
                          aria-label={`Aumentar ${item.name}`}
                          disabled={atMax}
                          title={atMax ? 'Sem mais unidades disponíveis' : undefined}
                          onClick={() => setQuantity(item.productId, item.quantity + 1)}
                        >+</button>
                      );
                    })()}
                  </span>
                </span>
                <button
                  type="button"
                  className="bag-panel-remove"
                  aria-label={`Remover ${item.name} da sacola`}
                  onClick={() => {
                    // Último item: a prévia some junto. O foco volta para a
                    // sacola em vez de cair no vazio.
                    if (items.length === 1) rootRef.current?.querySelector<HTMLElement>('.bag-link')?.focus();
                    removeItem(item.productId);
                  }}
                  title="Remover da sacola"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <div className="bag-panel-foot">
            <span className="bag-panel-total">
              <span>Total</span>
              <strong>{formatCurrency(total)}</strong>
            </span>
            <Link to="/checkout" className="bag-panel-go">
              Ir para a sacola
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
