import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { BagPreview } from '../BagPreview';
import { CartContext, type CartContextValue, type CartItem } from '../../contexts/cart';

/**
 * A prévia da sacola: aparece com o mouse ou o foco, lista o que tem, soma e
 * leva à sacola. Some quando não há nada para mostrar.
 */

const ITENS: CartItem[] = [
  { productId: 1, name: 'Perfume Egeo Dolce 90ml', imageUrl: null, unitPrice: 139.9, quantity: 1 },
  { productId: 2, name: 'Sabonete em Barra', imageUrl: null, unitPrice: 5.9, quantity: 3 },
];

function montar(items: CartItem[], rota = '/', availability: Record<number, { available: number }> = {}) {
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const setQuantity = vi.fn();
  const removeItem = vi.fn();
  const cart = {
    items, total, itemCount: items.reduce((s, i) => s + i.quantity, 0),
    expiresAt: null, reservationMinutes: null, availability, setQuantity, removeItem,
  } as unknown as CartContextValue;
  render(
    <MemoryRouter initialEntries={[rota]}>
      <CartContext.Provider value={cart}>
        <BagPreview><a href="/checkout" className="bag-link">Sacola</a></BagPreview>
      </CartContext.Provider>
    </MemoryRouter>,
  );
  return { setQuantity, removeItem };
}

describe('BagPreview', () => {
  it('com o foco na sacola, mostra os itens, o total e o botão de ir para a sacola', async () => {
    montar(ITENS);

    await userEvent.tab();

    const previa = await screen.findByRole('region', { name: /prévia da sacola/i });
    expect(previa).toHaveTextContent('Perfume Egeo Dolce 90ml');
    expect(screen.getByRole('group', { name: /quantidade de sabonete/i })).toHaveTextContent('3');
    expect(previa).toHaveTextContent('R$ 17,70');
    expect(previa).toHaveTextContent('4 itens');
    expect(screen.getByRole('link', { name: /ir para a sacola/i })).toHaveAttribute('href', '/checkout');
  });

  it('sacola vazia: nada aparece', async () => {
    montar([]);

    await userEvent.tab();

    expect(screen.queryByRole('region', { name: /prévia da sacola/i })).not.toBeInTheDocument();
  });

  it('na própria tela da sacola, não há prévia', async () => {
    montar(ITENS, '/checkout');

    await userEvent.tab();

    expect(screen.queryByRole('region', { name: /prévia da sacola/i })).not.toBeInTheDocument();
  });

  it('Esc fecha e devolve o foco para a sacola', async () => {
    montar(ITENS);

    await userEvent.tab();
    await screen.findByRole('region', { name: /prévia da sacola/i });
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('region', { name: /prévia da sacola/i })).not.toBeInTheDocument());
    expect(screen.getByText('Sacola')).toHaveFocus();
  });

  it('"+" soma uma unidade; "−" tira uma; "Remover" tira o item', async () => {
    const { setQuantity, removeItem } = montar(ITENS, '/', { 2: { available: 10 } });

    await userEvent.tab();
    await screen.findByRole('region', { name: /prévia da sacola/i });
    await userEvent.click(screen.getByRole('button', { name: /aumentar sabonete/i }));
    await userEvent.click(screen.getByRole('button', { name: /diminuir sabonete/i }));
    await userEvent.click(screen.getByRole('button', { name: /remover perfume/i }));

    expect(setQuantity).toHaveBeenNthCalledWith(1, 2, 4);
    expect(setQuantity).toHaveBeenNthCalledWith(2, 2, 2);
    expect(removeItem).toHaveBeenCalledWith(1);
  });

  it('"+" desliga quando a sacola já tem tudo o que está disponível', async () => {
    montar(ITENS, '/', { 2: { available: 3 } });

    await userEvent.tab();
    await screen.findByRole('region', { name: /prévia da sacola/i });

    expect(screen.getByRole('button', { name: /aumentar sabonete/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /aumentar perfume/i })).toBeEnabled();
  });

  it('"−" para em uma unidade: tirar o item é com "Remover"', async () => {
    montar(ITENS);

    await userEvent.tab();
    await screen.findByRole('region', { name: /prévia da sacola/i });

    expect(screen.getByRole('button', { name: /diminuir perfume/i })).toBeDisabled();
  });
});
