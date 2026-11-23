import { useCallback, useEffect, useRef, useState } from 'react';

type UseAsyncOptions<T> = {
  /** O valor enquanto nada chegou — e para onde volta se `resetOnError`. */
  initial: T;
  /** Prefixo do `console.error` quando a busca falha e ninguém trata o erro. */
  errorMessage: string;
  /**
   * Na falha, volta ao `initial` em vez de manter o que já estava na tela.
   * O padrão mantém: um refetch que falha não deve esvaziar uma lista boa.
   */
  resetOnError?: boolean;
  /** Chamado com o dado de cada busca que vale (a mais recente) e deu certo. */
  onSuccess?: (data: T) => void;
  /**
   * Quem trata o erro — um aviso na tela, fechar um painel. Quando existe, o
   * `console.error` não é escrito: o erro já tem dono.
   */
  onError?: (error: unknown) => void;
};

/**
 * Busca um dado ao montar e sempre que `fetcher` mudar, com `loading` e `refetch`.
 *
 * Substitui o `useState` + `try/catch/finally` + `useEffect` que cada hook de
 * leitura repetia. `fetcher` precisa ter identidade estável: uma função de
 * módulo, ou um `useCallback` cujas dependências são os parâmetros da busca —
 * é assim que mudar o período, por exemplo, dispara uma busca nova.
 *
 * Só a resposta da busca mais recente vale. Sem isso, trocar o filtro duas vezes
 * seguidas deixava a resposta lenta da primeira sobrescrever a da segunda.
 *
 * `loading` volta a `true` a cada busca. `initialLoading` é só a primeira: serve
 * a quem mostra esqueleto na carga inicial mas não quer piscar a cada recarga.
 */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  { initial, errorMessage, resetOnError = false, onSuccess, onError }: UseAsyncOptions<T>
) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [settled, setSettled] = useState(false);

  // O `initial` costuma ser um literal novo a cada render (`[]`), e os callbacks
  // costumam ser arrows inline do pai. Guardá-los aqui evita que entrem nas
  // dependências e disparem a busca em loop. A atualização vem antes do efeito de
  // busca, na ordem em que os efeitos rodam.
  const initialRef = useRef(initial);
  const callbacks = useRef({ onSuccess, onError });
  useEffect(() => { callbacks.current = { onSuccess, onError }; });

  const generation = useRef(0);

  const refetch = useCallback(async () => {
    const mine = ++generation.current;
    setLoading(true);

    try {
      const result = await fetcher();
      if (mine !== generation.current) return;

      setData(result);
      callbacks.current.onSuccess?.(result);
    } catch (err) {
      if (mine !== generation.current) return;

      if (callbacks.current.onError) callbacks.current.onError(err);
      else console.error(errorMessage, err);

      if (resetOnError) setData(initialRef.current);
    } finally {
      if (mine === generation.current) {
        setLoading(false);
        setSettled(true);
      }
    }
  }, [fetcher, errorMessage, resetOnError]);

  useEffect(() => {
    refetch();

    // Desmontar, ou trocar o `fetcher`, invalida a busca em andamento.
    return () => { generation.current += 1; };
  }, [refetch]);

  return { data, setData, loading, initialLoading: loading && !settled, refetch };
}
