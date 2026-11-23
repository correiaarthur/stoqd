import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../ToastProvider';
import { useToast } from '../toast';

/**
 * Avisos no lugar de `alert()`: não bloqueiam a tela, somem sozinhos, e o erro
 * fica mais tempo — é o texto que a pessoa precisa ler para saber o que fazer.
 */

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function Disparador() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('Produto salvo.')}>sucesso</button>
      <button onClick={() => toast.error('Não foi possível salvar.')}>erro</button>
      <button onClick={() => { for (let i = 1; i <= 6; i++) toast.success(`Aviso ${i}`); }}>muitos</button>
    </>
  );
}

// `fireEvent` e não `userEvent`: o userEvent espera timers que, com o relógio
// falso, só avançam quando o teste manda.
function montar() {
  render(<ToastProvider><Disparador /></ToastProvider>);
  return { click: (alvo: HTMLElement) => act(() => { fireEvent.click(alvo); }) };
}

describe('ToastProvider', () => {
  it('a região existe antes de qualquer aviso, para o leitor de tela anunciar o primeiro', () => {
    montar();
    expect(document.querySelector('.toast-region')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sucesso aparece como status e some depois de 4 segundos', () => {
    const user = montar();
    user.click(screen.getByText('sucesso'));

    expect(screen.getByRole('status')).toHaveTextContent('Produto salvo.');

    act(() => { vi.advanceTimersByTime(3900); });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('erro aparece como alerta e fica mais tempo: 7 segundos', () => {
    const user = montar();
    user.click(screen.getByText('erro'));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar.');

    act(() => { vi.advanceTimersByTime(6900); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o botão fecha o aviso na hora', () => {
    const user = montar();
    user.click(screen.getByText('erro'));

    user.click(screen.getByRole('button', { name: 'Fechar aviso' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('avisos empilham, e passando de 4 o mais antigo sai', () => {
    const user = montar();
    user.click(screen.getByText('muitos'));

    const visiveis = screen.getAllByRole('status').map(el => el.textContent);
    expect(visiveis).toEqual(['Aviso 3', 'Aviso 4', 'Aviso 5', 'Aviso 6']);
  });

  it('fechar um não leva os outros, e o relógio do fechado não derruba o seguinte', () => {
    const user = montar();
    user.click(screen.getByText('sucesso'));
    act(() => { vi.advanceTimersByTime(2000); });
    user.click(screen.getByText('erro'));

    // O de sucesso (4s) vence em 2s; o erro (7s) segue.
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('o objeto do hook tem identidade estável entre renders', () => {
    const vistos: unknown[] = [];
    function Espiao() { vistos.push(useToast()); return null; }

    const { rerender } = render(<ToastProvider><Espiao /></ToastProvider>);
    rerender(<ToastProvider><Espiao /></ToastProvider>);

    expect(new Set(vistos).size).toBe(1);
  });

  it('usar o hook fora do provider é erro claro, não um aviso que nunca aparece', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Solto() { useToast(); return null; }

    expect(() => render(<Solto />)).toThrow(/ToastProvider/);
  });
});
