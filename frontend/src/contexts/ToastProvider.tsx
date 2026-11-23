import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ToastContext, type ToastApi } from './toast';
import './ToastProvider.css';

type Kind = 'success' | 'error';
type ToastItem = { id: number; kind: Kind; message: string };

/** Erro fica mais: é o texto que a pessoa precisa ler para saber o que fazer. */
const DURATION_MS: Record<Kind, number> = { success: 4000, error: 7000 };

/** Acima disso o mais antigo sai — uma pilha de avisos vira parede. */
const MAX_VISIBLE = 4;

const ICON: Record<Kind, string> = {
  success: 'M20 6L9 17l-5-5',
  error: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8v5M12 16v.5',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);

    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const push = useCallback((kind: Kind, message: string) => {
    const id = ++nextId.current;

    setToasts(current => [...current, { id, kind, message }].slice(-MAX_VISIBLE));
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION_MS[kind]));
  }, [dismiss]);

  // Desmontar o provider não pode deixar relógio ligado.
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: message => push('success', message),
    error: message => push('error', message),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* A região existe desde o início: leitor de tela só anuncia o que entra
          numa região que já estava na página. */}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <svg className="toast-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON[toast.kind]} />
            </svg>
            <p className="toast-message">{toast.message}</p>
            <button type="button" className="toast-close" aria-label="Fechar aviso" onClick={() => dismiss(toast.id)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
