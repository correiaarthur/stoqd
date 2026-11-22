import { createContext, useContext } from 'react';

export type ConfirmOptions = {
  title: string;
  /** Parágrafos separados por linha em branco (`\n\n`). */
  message?: string;
  /** Rótulo do botão que confirma — o verbo da ação ("Apagar"), não "Sim". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` pinta o botão de vermelho: ação que não se desfaz. */
  tone?: 'danger' | 'neutral';
};

/** Resolve `true` se a pessoa confirmou; `false` em qualquer outra saída. */
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Pergunta antes de uma ação que não se desfaz, no lugar de `window.confirm()`:
 *
 *   if (!await confirm({ title: 'Apagar o cliente?', confirmLabel: 'Apagar', tone: 'danger' })) return;
 *
 * A função devolvida tem identidade estável.
 */
export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>.');
  return context;
}
