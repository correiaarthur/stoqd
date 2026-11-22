import { createContext, useContext } from 'react';

export type ToastApi = {
  /** Algo deu certo. Some sozinho em poucos segundos. */
  success: (message: string) => void;
  /** Algo falhou. Fica mais tempo na tela, porque é o que a pessoa precisa ler. */
  error: (message: string) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * Avisos curtos que não bloqueiam a tela, no lugar de `alert()`.
 *
 * O objeto devolvido tem identidade estável: pode entrar em dependências de
 * `useEffect`/`useCallback` sem disparar nada a cada render.
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return context;
}
