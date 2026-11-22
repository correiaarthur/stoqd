import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './confirm';
import './ConfirmProvider.css';

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  // Quem espera a resposta. Fica num ref, e não no estado: resolver a promessa
  // não é render, e um updater do React que resolvesse promessas rodaria duas
  // vezes no StrictMode.
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const settle = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => new Promise<boolean>((resolve) => {
    // Uma pergunta nova com outra aberta recusa a anterior: ninguém fica
    // esperando para sempre por um diálogo que já saiu da tela.
    resolver.current?.(false);
    resolver.current = resolve;
    setOptions(next);
  }), []);

  // Desmontar o provider com pergunta aberta não deixa a promessa pendurada.
  useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && <ConfirmDialog options={options} onAnswer={settle} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (answer: boolean) => void }) {
  const { title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'neutral' } = options;

  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // O foco começa em "Cancelar": numa ação que não se desfaz, um Enter distraído
  // não pode ser o que confirma. Ao fechar, o foco volta ao que abriu o diálogo.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Esc recusa. No `document`, em captura: o foco pode estar em qualquer lugar e
  // o Esc não deve chegar a quem estiver atrás (um menu aberto, por exemplo).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onAnswer(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onAnswer]);

  // Só há dois botões: o Tab circula entre eles em vez de escapar para a página.
  const trapTab = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Tab') return;

    const first = cancelRef.current;
    const last = confirmRef.current;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const paragraphs = message?.split(/\n{2,}/).filter(Boolean) ?? [];

  return (
    <div
      className="modal-overlay confirm-overlay"
      // Clicar fora é desistir; clicar dentro do diálogo não chega aqui.
      onMouseDown={(event) => { if (event.target === event.currentTarget) onAnswer(false); }}
    >
      <div
        className={`modal-content confirm-dialog is-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={paragraphs.length > 0 ? messageId : undefined}
        onKeyDown={trapTab}
      >
        <h2 id={titleId} className="confirm-title">{title}</h2>

        {paragraphs.length > 0 && (
          <div id={messageId} className="confirm-message">
            {paragraphs.map((text, index) => <p key={index}>{text}</p>)}
          </div>
        )}

        <div className="form-actions confirm-actions">
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={() => onAnswer(false)}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={tone === 'danger' ? 'btn-primary confirm-danger' : 'btn-primary'}
            onClick={() => onAnswer(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
