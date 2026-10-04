import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CartProvider } from '../CartProvider';
import { useCart } from '../cart';

/**
 * O carrinho é o módulo com mais lógica do frontend: vive no `localStorage`,
 * sobrevive ao fechar o navegador, conversa com o servidor com pausa, e muda de
 * comportamento quando quem está logado é o admin.
 *
 * Nada disso é visual, e é por isso que está coberto aqui: uma refatoração de
 * identidade vai reescrever o Checkout em volta deste provider, e o que precisa
 * continuar valendo é o comportamento, não a marcação.
 *
 * O `api` é dublado. O que interessa é o que o provider faz com a resposta e
 * quando ele chama — não a rede.
 */

const postMock = vi.fn();

vi.mock('../../api', () => ({
  api: {
    post: (...args: unknown[]) => postMock(...args),
    get: vi.fn(),
  },
}));

const isAdminMock = vi.fn(() => false);

vi.mock('../../utils/auth', () => ({
  isAdmin: () => isAdminMock(),
  getToken: () => null,
  clearToken: vi.fn(),
}));

/** Tela mínima que expõe o contexto como texto e botões. */
function Sonda() {
  const cart = useCart();

  return (
    <div>
      <output aria-label="itens">{cart.itemCount}</output>
      <output aria-label="total">{cart.total.toFixed(2)}</output>
      <output aria-label="linhas">{cart.items.length}</output>
      <button onClick={() => cart.addItem({ id: 7, name: 'Café', sellingPrice: 10 }, 1)}>somar café</button>
      <button onClick={() => cart.addItem({ id: 8, name: 'Chá', activePrice: 5, sellingPrice: 9 }, 2)}>somar chá</button>
      <button onClick={() => cart.setQuantity(7, 5)}>café para 5</button>
      <button onClick={() => cart.setQuantity(7, 0)}>café para 0</button>
      <button onClick={() => cart.removeItem(7)}>remover café</button>
      <button onClick={() => cart.clear()}>limpar</button>
    </div>
  );
}

function montar() {
  return render(<CartProvider><Sonda /></CartProvider>);
}

const valor = (rotulo: string) => screen.getByLabelText(rotulo).textContent;

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({ data: { items: [] } });
  isAdminMock.mockReturnValue(false);
  localStorage.clear();
});

afterEach(() => { vi.useRealTimers(); });

describe('somar e remover itens', () => {
  it('começa vazio', () => {
    montar();
    expect(valor('itens')).toBe('0');
    expect(valor('total')).toBe('0.00');
  });

  it('somar o mesmo produto duas vezes não cria duas linhas', async () => {
    montar();
    await userEvent.click(screen.getByText('somar café'));
    await userEvent.click(screen.getByText('somar café'));

    expect(valor('linhas')).toBe('1');
    expect(valor('itens')).toBe('2');
  });

  it('usa o preço promocional quando existe', async () => {
    // `activePrice` 5 vence `sellingPrice` 9 — é o preço que o cliente paga.
    montar();
    await userEvent.click(screen.getByText('somar chá'));

    expect(valor('total')).toBe('10.00');
  });

  it('total soma preço × quantidade de cada linha', async () => {
    montar();
    await userEvent.click(screen.getByText('somar café')); // 1 × 10
    await userEvent.click(screen.getByText('somar chá'));  // 2 × 5

    expect(valor('total')).toBe('20.00');
  });

  it('quantidade zero remove a linha', async () => {
    montar();
    await userEvent.click(screen.getByText('somar café'));
    await userEvent.click(screen.getByText('café para 0'));

    expect(valor('linhas')).toBe('0');
  });

  it('remover e limpar', async () => {
    montar();
    await userEvent.click(screen.getByText('somar café'));
    await userEvent.click(screen.getByText('somar chá'));

    await userEvent.click(screen.getByText('remover café'));
    expect(valor('linhas')).toBe('1');

    await userEvent.click(screen.getByText('limpar'));
    expect(valor('linhas')).toBe('0');
  });
});

describe('persistência no navegador', () => {
  it('o carrinho sobrevive a uma remontagem', async () => {
    const { unmount } = montar();
    await userEvent.click(screen.getByText('somar café'));
    unmount();

    montar();
    expect(valor('itens')).toBe('1');
  });

  it('lixo no localStorage não derruba a tela', () => {
    // O carrinho vive num lugar que o usuário consegue editar.
    for (const bruto of ['não é json', '{"a":1}', '[1,2,3]', 'null']) {
      localStorage.setItem('cart', bruto);
      const { unmount } = montar();
      expect(valor('linhas')).toBe('0');
      unmount();
    }
  });

  it('descarta linha sem productId ou com quantidade inválida', () => {
    localStorage.setItem('cart', JSON.stringify([
      { productId: 7, name: 'Café', unitPrice: 10, quantity: 2 },
      { productId: 'oito', name: 'Chá', unitPrice: 5, quantity: 1 },
      { productId: 9, name: 'Mate', unitPrice: 5, quantity: 0 },
      { productId: 10, name: 'Leite', unitPrice: 5, quantity: -3 },
    ]));

    montar();
    expect(valor('linhas')).toBe('1');
    expect(valor('itens')).toBe('2');
  });
});

describe('reserva no servidor', () => {
  it('mexer no carrinho reserva depois de uma pausa, não a cada clique', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();

    const clicar = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await clicar.click(screen.getByText('somar café'));
    await clicar.click(screen.getByText('somar café'));
    await clicar.click(screen.getByText('somar café'));

    const reservasAntes = postMock.mock.calls.filter(c => c[0] === '/cart/reserve').length;
    expect(reservasAntes).toBe(0);

    await act(async () => { vi.advanceTimersByTime(1000); });

    const reservasDepois = postMock.mock.calls.filter(c => c[0] === '/cart/reserve').length;
    expect(reservasDepois).toBe(1);
  });

  it('a reserva manda a lista inteira, porque reservar é substituir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();

    const clicar = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await clicar.click(screen.getByText('somar café'));
    await clicar.click(screen.getByText('somar chá'));
    await act(async () => { vi.advanceTimersByTime(1000); });

    const reserva = postMock.mock.calls.find(c => c[0] === '/cart/reserve');
    expect(reserva?.[1]).toMatchObject({
      items: [{ productId: 7, quantity: 1 }, { productId: 8, quantity: 2 }],
    });
    expect((reserva?.[1] as { cartToken: string }).cartToken).toMatch(/^[a-f0-9]{32}$/);
  });

  it('o admin não reserva contra si mesmo', async () => {
    // Ele vende no balcão pelo mesmo checkout; reservar tiraria da vitrine um
    // estoque que ele já tem na mão.
    isAdminMock.mockReturnValue(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();

    const clicar = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await clicar.click(screen.getByText('somar café'));
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(postMock.mock.calls.filter(c => c[0] === '/cart/reserve')).toHaveLength(0);
  });

  it('falha de rede na reserva não derruba a tela', async () => {
    postMock.mockRejectedValue(new Error('offline'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();

    const clicar = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await clicar.click(screen.getByText('somar café'));
    await act(async () => { vi.advanceTimersByTime(1000); });

    // O servidor confere de novo no envio do pedido, que é onde a decisão vale.
    expect(valor('itens')).toBe('1');
  });
});

describe('soltar a reserva ao esvaziar', () => {
  it('não solta reserva no carregamento de uma página com carrinho vazio', () => {
    // Era um POST por abertura de página para liberar reserva que não existe —
    // o caso de todo visitante novo, gastando o limite de requisições.
    montar();
    expect(postMock.mock.calls.filter(c => c[0] === '/cart/release')).toHaveLength(0);
  });

  it('solta a reserva quando o carrinho passa a ficar vazio', async () => {
    montar();
    await userEvent.click(screen.getByText('somar café'));
    postMock.mockClear();

    await userEvent.click(screen.getByText('limpar'));

    expect(postMock.mock.calls.filter(c => c[0] === '/cart/release')).toHaveLength(1);
  });

  it('esvaziar duas vezes não solta duas vezes', async () => {
    montar();
    await userEvent.click(screen.getByText('somar café'));
    await userEvent.click(screen.getByText('limpar'));
    postMock.mockClear();

    await userEvent.click(screen.getByText('limpar'));

    expect(postMock.mock.calls.filter(c => c[0] === '/cart/release')).toHaveLength(0);
  });
});
