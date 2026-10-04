import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PaymentPicker } from '../PaymentPicker';

/**
 * A escolha de como pagar.
 *
 * Este é o componente da aplicação com mais decisão de interface por linha — "duas
 * escolhas, não onze" é uma decisão de desenho documentada no próprio arquivo — e
 * por isso é o que mais tem a perder numa refatoração de identidade visual.
 *
 * Os testes asseguram o **comportamento e a semântica**: que a lista de parcelas
 * é um `listbox` com `option`s, que `aria-expanded` e `aria-selected` acompanham
 * o estado, que o valor mostrado é o que o servidor calculou. Nenhuma asserção
 * toca em classe CSS, então trocar `payment-mode` por outro nome não quebra nada
 * daqui — mas perder o `role="listbox"` quebra, e é exatamente o que se quer.
 */

const OPCOES = [
  { installments: 2, interestPercent: 0, total: 100, interest: 0, installmentValue: 50 },
  { installments: 3, interestPercent: 0, total: 100, interest: 0, installmentValue: 33.33 },
  { installments: 4, interestPercent: 2, total: 102, interest: 2, installmentValue: 25.5 },
];

function montar(over: Partial<Parameters<typeof PaymentPicker>[0]> = {}) {
  const props = {
    netTotal: 100,
    installmentOptions: OPCOES,
    loading: false,
    value: { paymentType: 'VISTA' as const, installmentsCount: 1 },
    onChange: vi.fn(),
    ...over,
  };
  return { ...render(<PaymentPicker {...props} />), props };
}

const aVista = () => screen.getByRole('button', { name: /à vista/i });
const parcelado = () => screen.getByRole('button', { name: /parcelado/i });

describe('à vista', () => {
  it('mostra o total líquido', () => {
    montar({ netTotal: 149.9 });
    expect(aVista()).toHaveTextContent('R$ 149,90');
  });

  it('escolher à vista volta para uma parcela', async () => {
    const { props } = montar({ value: { paymentType: 'PRAZO', installmentsCount: 4 } });

    await userEvent.click(aVista());

    expect(props.onChange).toHaveBeenCalledWith({ paymentType: 'VISTA', installmentsCount: 1 });
  });
});

describe('parcelado', () => {
  it('resume a faixa disponível', () => {
    montar();
    expect(parcelado()).toHaveTextContent('de 2x a 4x');
  });

  it('a lista de parcelas só aparece depois de escolher parcelado', async () => {
    // A decisão de desenho: o número de parcelas é um detalhe que só aparece
    // depois de a pessoa dizer que quer parcelar.
    const { unmount } = montar();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    unmount();

    montar({ value: { paymentType: 'PRAZO', installmentsCount: 2 } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('aria-expanded acompanha o estado', () => {
    const { unmount } = montar();
    expect(parcelado()).toHaveAttribute('aria-expanded', 'false');
    unmount();

    montar({ value: { paymentType: 'PRAZO', installmentsCount: 2 } });
    expect(parcelado()).toHaveAttribute('aria-expanded', 'true');
  });

  it('ao trocar para parcelado cai na primeira opção, não num 1x que não existe', async () => {
    const { props } = montar();

    await userEvent.click(parcelado());

    expect(props.onChange).toHaveBeenCalledWith({ paymentType: 'PRAZO', installmentsCount: 2 });
  });

  it('mantém a parcela escolhida se ela existe na lista', async () => {
    const { props } = montar({ value: { paymentType: 'VISTA', installmentsCount: 4 } });

    await userEvent.click(parcelado());

    expect(props.onChange).toHaveBeenCalledWith({ paymentType: 'PRAZO', installmentsCount: 4 });
  });

  it('cada opção mostra parcela, juros e total', () => {
    montar({ value: { paymentType: 'PRAZO', installmentsCount: 2 } });
    const opcoes = screen.getAllByRole('option');

    expect(opcoes).toHaveLength(3);
    expect(opcoes[0]).toHaveTextContent('2x');
    expect(opcoes[0]).toHaveTextContent('sem juros');
    expect(opcoes[2]).toHaveTextContent('juros de 2%');
    expect(opcoes[2]).toHaveTextContent('R$ 102,00');
  });

  it('a opção escolhida é a marcada como selecionada', () => {
    montar({ value: { paymentType: 'PRAZO', installmentsCount: 3 } });
    const opcoes = screen.getAllByRole('option');

    expect(opcoes[1]).toHaveAttribute('aria-selected', 'true');
    expect(opcoes[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('escolher uma opção avisa o pai', async () => {
    const { props } = montar({ value: { paymentType: 'PRAZO', installmentsCount: 2 } });

    await userEvent.click(screen.getAllByRole('option')[2]!);

    expect(props.onChange).toHaveBeenCalledWith({ paymentType: 'PRAZO', installmentsCount: 4 });
  });

  it('o cabeçalho mostra o total COM juros da opção escolhida', () => {
    // O número que a pessoa vai pagar, não o líquido.
    montar({ value: { paymentType: 'PRAZO', installmentsCount: 4 } });
    expect(parcelado()).toHaveTextContent('R$ 102,00');
  });
});

describe('parcelado indisponível', () => {
  it('o balcão sem cliente não pode parcelar, e a tela diz por quê', async () => {
    const { props } = montar({ installmentsDisabledReason: 'Selecione um cliente para vender a prazo.' });

    expect(parcelado()).toBeDisabled();
    expect(screen.getByText('Selecione um cliente para vender a prazo.')).toBeInTheDocument();

    await userEvent.click(parcelado());
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('sem nenhuma opção configurada, avisa que só dá à vista', () => {
    montar({ installmentOptions: [] });

    expect(parcelado()).toBeDisabled();
    expect(screen.getByText(/só à vista/i)).toBeInTheDocument();
  });

  it('enquanto carrega não diz "indisponível"', () => {
    // Dizer indisponível durante o carregamento faria a pessoa desistir de uma
    // opção que existe.
    montar({ installmentOptions: [], loading: true });

    expect(parcelado()).toHaveTextContent('carregando...');
    expect(screen.queryByText(/só à vista/i)).not.toBeInTheDocument();
  });
});

describe('texto por contexto', () => {
  it('pergunta ao cliente, afirma para o balcão', () => {
    const { unmount } = montar({ variant: 'customer' });
    expect(screen.getByText('Como você quer pagar?')).toBeInTheDocument();
    unmount();

    montar({ variant: 'admin' });
    expect(screen.getByText('Forma de pagamento')).toBeInTheDocument();
  });
});
