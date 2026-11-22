import { useCallback, useEffect, useRef, useState } from 'react';

type UseAsyncOptions<T> = {
  /** O valor enquanto nada chegou — e para onde volta se `resetOnError`. */
  initial: T;
  /** Prefixo do `console.error` quando a busca falha. */
  errorMessage: string;
  /**
   * Na falha, volta ao `initial` em vez de manter o que já estava na tela.
   * O padrão mantém: um refetch que falha não deve esvaziar uma lista boa.
   */
  resetOnError?: boolean;
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
 */
export function useAsync<T>(fetcher: () => Promise<T>, { initial, errorMessage, resetOnError = false }: UseAsyncOptions<T>) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);

  // O `initial` costuma ser um literal novo a cada render (`[]`); guardá-lo aqui
  // evita que ele entre nas dependências e dispare a busca em loop.
  const initialRef = useRef(initial);
  const generation = useRef(0);

  const refetch = useCallback(async () => {
    const mine = ++generation.current;
    setLoading(true);

    try {
      const result = await fetcher();
      if (mine === generation.current) setData(result);
    } catch (err) {
      if (mine !== generation.current) return;

      console.error(errorMessage, err);
      if (resetOnError) setData(initialRef.current);
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, [fetcher, errorMessage, resetOnError]);

  useEffect(() => {
    refetch();

    // Desmontar, ou trocar o `fetcher`, invalida a busca em andamento.
    return () => { generation.current += 1; };
  }, [refetch]);

  return { data, setData, loading, refetch };
}
