import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAsync } from '../useAsync';

/**
 * O contrato que os sete hooks de leitura passaram a compartilhar: carrega ao
 * montar, `loading` volta a `true` a cada busca, falha não esvazia o que já
 * estava na tela, e só a busca mais recente vale.
 */

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

/** Uma promessa que o teste resolve ou rejeita quando quiser. */
function adiada<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const opcoes = { initial: [] as string[], errorMessage: 'Erro ao buscar:' };

describe('useAsync', () => {
  it('começa carregando, com o valor inicial, e entrega o dado quando chega', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a', 'b']);
    const { result } = renderHook(() => useAsync(fetcher, opcoes));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(['a', 'b']);
  });

  it('um valor inicial novo a cada render não dispara a busca de novo', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a']);
    const { result, rerender } = renderHook(() => useAsync(fetcher, { initial: [], errorMessage: 'x' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender();
    rerender();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetch volta a marcar loading e atualiza o dado', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(['velho']).mockResolvedValueOnce(['novo']);
    const { result } = renderHook(() => useAsync(fetcher, opcoes));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pendente!: Promise<void>;
    act(() => { pendente = result.current.refetch(); });
    expect(result.current.loading).toBe(true);

    await act(async () => { await pendente; });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(['novo']);
  });

  it('falha mantém o que já estava na tela, loga e libera o loading', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(['bom']).mockRejectedValueOnce(new Error('rede'));
    const { result } = renderHook(() => useAsync(fetcher, opcoes));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.refetch(); });

    expect(result.current.data).toEqual(['bom']);
    expect(result.current.loading).toBe(false);
    expect(console.error).toHaveBeenCalledWith('Erro ao buscar:', expect.any(Error));
  });

  it('com resetOnError, a falha volta ao valor inicial', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(['bom']).mockRejectedValueOnce(new Error('rede'));
    const { result } = renderHook(() => useAsync(fetcher, { ...opcoes, resetOnError: true }));
    await waitFor(() => expect(result.current.data).toEqual(['bom']));

    await act(async () => { await result.current.refetch(); });

    expect(result.current.data).toEqual([]);
  });

  it('trocar o fetcher busca de novo, e a resposta lenta da busca anterior é descartada', async () => {
    const lenta = adiada<string[]>();
    const rapida = adiada<string[]>();

    const { result, rerender } = renderHook(({ fetcher }) => useAsync(fetcher, opcoes), {
      initialProps: { fetcher: () => lenta.promise },
    });

    rerender({ fetcher: () => rapida.promise });

    await act(async () => { rapida.resolve(['recente']); });
    await waitFor(() => expect(result.current.data).toEqual(['recente']));

    // A primeira chega por último e não pode sobrescrever a segunda.
    await act(async () => { lenta.resolve(['antiga']); });

    expect(result.current.data).toEqual(['recente']);
    expect(result.current.loading).toBe(false);
  });

  it('não atualiza estado depois de desmontar', async () => {
    const pendente = adiada<string[]>();
    const { unmount } = renderHook(() => useAsync(() => pendente.promise, opcoes));

    unmount();
    await act(async () => { pendente.resolve(['tarde']); });

    expect(console.error).not.toHaveBeenCalled();
  });

  it('setData troca o dado localmente, sem nova busca', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a']);
    const { result } = renderHook(() => useAsync(fetcher, opcoes));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.setData(['a', 'inserido']); });

    expect(result.current.data).toEqual(['a', 'inserido']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('initialLoading é só a primeira carga: recarregar não volta ao esqueleto', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a']);
    const { result } = renderHook(() => useAsync(fetcher, opcoes));

    expect(result.current.initialLoading).toBe(true);
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let pendente!: Promise<void>;
    act(() => { pendente = result.current.refetch(); });

    expect(result.current.loading).toBe(true);
    expect(result.current.initialLoading).toBe(false);
    await act(async () => { await pendente; });
  });

  it('initialLoading também termina quando a primeira carga falha', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useAsync(fetcher, opcoes));

    await waitFor(() => expect(result.current.initialLoading).toBe(false));
  });

  it('onSuccess recebe o dado de cada busca que vale', async () => {
    const onSuccess = vi.fn();
    const fetcher = vi.fn().mockResolvedValueOnce(['um']).mockResolvedValueOnce(['dois']);
    const { result } = renderHook(() => useAsync(fetcher, { ...opcoes, onSuccess }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(['um']));

    await act(async () => { await result.current.refetch(); });

    expect(onSuccess).toHaveBeenLastCalledWith(['dois']);
    expect(onSuccess).toHaveBeenCalledTimes(2);
  });

  it('onSuccess não é chamado para uma busca que já não vale', async () => {
    const onSuccess = vi.fn();
    const lenta = adiada<string[]>();
    const rapida = adiada<string[]>();

    const { rerender } = renderHook(({ fetcher }) => useAsync(fetcher, { ...opcoes, onSuccess }), {
      initialProps: { fetcher: () => lenta.promise },
    });
    rerender({ fetcher: () => rapida.promise });

    await act(async () => { rapida.resolve(['recente']); });
    await act(async () => { lenta.resolve(['antiga']); });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(['recente']);
  });

  it('onError trata o erro e, tendo dono, o console não recebe nada', async () => {
    const onError = vi.fn();
    const falha = new Error('rede');
    const fetcher = vi.fn().mockRejectedValue(falha);
    const { result } = renderHook(() => useAsync(fetcher, { ...opcoes, onError }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onError).toHaveBeenCalledWith(falha);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('callbacks inline (novos a cada render) usam sempre a versão mais recente, sem refazer a busca', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a']);
    const antigo = vi.fn();
    const recente = vi.fn();

    const { result, rerender } = renderHook(({ onSuccess }) => useAsync(fetcher, { ...opcoes, onSuccess }), {
      initialProps: { onSuccess: antigo },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ onSuccess: recente });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => { await result.current.refetch(); });

    expect(recente).toHaveBeenCalledTimes(1);
    expect(antigo).toHaveBeenCalledTimes(1); // só a primeira carga
  });
});
