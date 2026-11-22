import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CartItem, ItemAvailability } from '../../../contexts/cart';
import { BagItem } from '../BagItem';
import { CheckoutHead } from '../CheckoutHead';
import { ReservationTimer } from '../ReservationTimer';
import { StockAlert } from '../StockAlert';

const item: CartItem = { productId: 7, name: 'Sabonete', imageUrl: null, unitPrice: 10, quantity: 3 };
const status = (over: Partial<ItemAvailability> = {}): ItemAvailability =>
  ({ available: 3, quantity: 3, reserved: 0, status: 'ok', ...over });

function bag(over: Partial<Parameters<typeof BagItem>[0]> = {}) {
  const onQuantity = vi.fn();
  const onRemove = vi.fn();
  render(
    <BagItem item={item} status={status()} left={3} admin={false} checkingStock={false}
      onQuantity={onQuantity} onRemove={onRemove} {...over} />
  );
  return { onQuantity, onRemove };
}

describe('BagItem', () => {
  it('mostra nome, subtotal e o preço de cada quando há mais de uma unidade', () => {
    bag();
    expect(screen.getByRole('heading', { name: 'Sabonete' })).toBeInTheDocument();
    expect(screen.getByText(/30,00/)).toBeInTheDocument();
    expect(screen.getByText(/10,00 cada/)).toBeInTheDocument();
  });

  it('os botões mexem na quantidade e removem', async () => {
    const { onQuantity, onRemove } = bag();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Diminuir quantidade' }));
    await user.click(screen.getByRole('button', { name: 'Aumentar quantidade' }));
    await user.click(screen.getByRole('button', { name: 'Remover Sabonete' }));

    expect(onQuantity).toHaveBeenNthCalledWith(1, 7, 2);
    expect(onQuantity).toHaveBeenNthCalledWith(2, 7, 4);
    expect(onRemove).toHaveBeenCalledWith(7);
  });

  it('quando restam menos que o pedido, avisa e oferece ajustar', async () => {
    const { onQuantity } = bag({ left: 2, status: status({ available: 2 }) });

    expect(screen.getByText(/Restam 2 das 3 unidades/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'ajustar para 2' }));

    expect(onQuantity).toHaveBeenCalledWith(7, 2);
  });

  it('esgotado, avisa e oferece remover da sacola', async () => {
    const { onRemove } = bag({ left: 0, status: status({ available: 0 }) });

    expect(screen.getByText(/Esgotado/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'remover da sacola' }));

    expect(onRemove).toHaveBeenCalledWith(7);
  });

  it('o balcão vê quantas unidades o site reservou, sem bloqueio', () => {
    bag({ admin: true, status: status({ quantity: 5, reserved: 2 }) });
    expect(screen.getByText(/5 un · 2 reservada\(s\) no site/)).toBeInTheDocument();
  });

  it('o visitante não vê a nota de reserva do balcão', () => {
    bag({ admin: false, status: status({ quantity: 5, reserved: 2 }) });
    expect(screen.queryByText(/reservada\(s\) no site/)).toBeNull();
  });

  it('enquanto o estoque não chegou, o lugar dele vira esqueleto', () => {
    const { container } = render(
      <BagItem item={item} status={undefined} left={null} admin={false} checkingStock
        onQuantity={vi.fn()} onRemove={vi.fn()} />
    );
    expect(container.querySelector('.checkout-item-skeleton')).not.toBeNull();
  });
});

describe('StockAlert', () => {
  it('um item: singular', () => {
    render(<StockAlert count={1} reservationExpired={false} onFixAll={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('O estoque de um item mudou.');
  });

  it('vários itens: plural', () => {
    render(<StockAlert count={3} reservationExpired={false} onFixAll={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('O estoque de 3 itens mudou.');
  });

  it('com a reserva vencida, diz isso', () => {
    render(<StockAlert count={2} reservationExpired onFixAll={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sua reserva venceu e o estoque de 2 itens mudou.');
  });

  it('"Ajustar tudo" chama a correção', async () => {
    const onFixAll = vi.fn();
    render(<StockAlert count={2} reservationExpired={false} onFixAll={onFixAll} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ajustar tudo' }));
    expect(onFixAll).toHaveBeenCalledTimes(1);
  });
});

describe('ReservationTimer', () => {
  it('mostra o tempo que falta e a barra proporcional ao total', () => {
    const { container } = render(<ReservationTimer secondsLeft={150} totalMinutes={5} />);

    expect(screen.getByRole('timer')).toHaveTextContent('Reservado por mais');
    expect(screen.getByRole('timer')).toHaveTextContent('2:30');
    expect(container.querySelector<HTMLElement>('.reservation-timer-fill')!.style.width).toBe('50%');
  });

  it('vencida: texto próprio, 00:00 e sem barra', () => {
    const { container } = render(<ReservationTimer secondsLeft={0} totalMinutes={5} />);

    expect(screen.getByRole('timer')).toHaveClass('expired');
    expect(screen.getByRole('timer')).toHaveTextContent('Reserva vencida');
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(container.querySelector('.reservation-timer-track')).toBeNull();
  });

  it('sem saber a duração total, mostra só o número — nunca uma fração inventada', () => {
    const { container } = render(<ReservationTimer secondsLeft={90} totalMinutes={null} />);

    expect(screen.getByRole('timer')).toHaveTextContent('1:30');
    expect(container.querySelector('.reservation-timer-track')).toBeNull();
  });

  it('a barra nunca passa de 100%', () => {
    const { container } = render(<ReservationTimer secondsLeft={9999} totalMinutes={5} />);
    expect(container.querySelector<HTMLElement>('.reservation-timer-fill')!.style.width).toBe('100%');
  });
});

describe('CheckoutHead', () => {
  const base = { productCount: 2, unitCount: 5, secondsLeft: 120, reservationMinutes: 5 };

  it('visitante: sacola, plural e o relógio da reserva', () => {
    render(<CheckoutHead admin={false} {...base} />);

    expect(screen.getByText('Sacola · 2 produtos, 5 unidades')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seu pedido, reservado.');
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('singular em um produto e uma unidade', () => {
    render(<CheckoutHead admin={false} {...base} productCount={1} unitCount={1} />);
    expect(screen.getByText('Sacola · 1 produto, 1 unidade')).toBeInTheDocument();
  });

  it('admin: balcão, "Fechar venda." e sem relógio', () => {
    render(<CheckoutHead admin {...base} />);

    expect(screen.getByText(/^Balcão · 2 produtos/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fechar venda.');
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('sacola vazia mostra só o lugar, sem contagem nem relógio', () => {
    render(<CheckoutHead admin={false} productCount={0} unitCount={0} secondsLeft={null} reservationMinutes={null} />);

    expect(screen.getByText('Sacola')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
  });
});
