import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CouponField } from '../CouponField';

/**
 * O campo de cupom.
 *
 * A regra que justifica o teste: o desconto depende do subtotal, então mexer no
 * carrinho reconfere o cupom sozinho. Sem isso, 10% aplicado sobre R$ 300
 * continuaria valendo R$ 30 depois de a pessoa remover metade dos itens — a tela
 * mostraria um desconto que a venda não vai dar.
 *
 * As asserções são por texto e papel (`getByRole('button', ...)`), nunca por
 * classe CSS. É o que faz estes testes sobreviverem a uma troca de identidade
 * visual em vez de virar trabalho extra.
 */

const postMock = vi.fn();
vi.mock('../../api', () => ({ api: { post: (...a: unknown[]) => postMock(...a) } }));

function erroDaApi(mensagem: string) {
  const e = new AxiosError('falhou');
  e.response = { data: { error: mensagem }, status: 400, statusText: '', headers: {}, config: {} as never };
  return e;
}

/**
 * Um pai de verdade: guarda cupom e subtotal em estado e reage ao `onChange`.
 *
 * O `rerender` do testing-library mantém as props que você passar, o que para
 * este componente esconde metade do comportamento — ele troca de ramo quando o
 * cupom sai, e a mensagem de erro só existe no ramo "sem cupom aplicado".
 */
function PaiComEstado({ aplicadoInicial }: {
  aplicadoInicial: { code: string; discount: number } | null;
}) {
  const [aplicado, setAplicado] = useState(aplicadoInicial);
  const [subtotal, setSubtotal] = useState(300);

  return (
    <div>
      <button onClick={() => setSubtotal(100)}>remover itens</button>
      <CouponField subtotal={subtotal} applied={aplicado} onChange={setAplicado} />
    </div>
  );
}

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({ data: { code: 'CICLO10', discount: 30 } });
});

describe('aplicar um cupom', () => {
  it('o botão só habilita a partir de 3 caracteres', async () => {
    render(<CouponField subtotal={300} applied={null} onChange={vi.fn()} />);
    const botao = screen.getByRole('button', { name: /aplicar/i });

    expect(botao).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), 'AB');
    expect(botao).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), 'C');
    expect(botao).toBeEnabled();
  });

  it('o código sobe para maiúsculas enquanto se digita', async () => {
    render(<CouponField subtotal={300} applied={null} onChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), 'ciclo10');

    expect(screen.getByRole('textbox')).toHaveValue('CICLO10');
  });

  it('avisa o pai com o desconto que o servidor calculou', async () => {
    // O valor vem do servidor, não da tela: quem decide quanto o cupom vale é
    // quem conhece as regras dele.
    const onChange = vi.fn();
    render(<CouponField subtotal={300} applied={null} onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox'), 'CICLO10');
    await userEvent.click(screen.getByRole('button', { name: /aplicar/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ code: 'CICLO10', discount: 30 });
    });
    expect(postMock).toHaveBeenCalledWith('/payment/coupons/validate', { code: 'CICLO10', subtotal: 300 });
  });

  it('Enter aplica sem precisar do botão', async () => {
    const onChange = vi.fn();
    render(<CouponField subtotal={300} applied={null} onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox'), 'CICLO10{Enter}');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('cupom recusado mostra o motivo que o servidor deu', async () => {
    // "venceu" e "não existe" mandam a pessoa fazer coisas diferentes.
    postMock.mockRejectedValue(erroDaApi('Este cupom venceu.'));
    const onChange = vi.fn();
    render(<CouponField subtotal={300} applied={null} onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox'), 'VELHO10');
    await userEvent.click(screen.getByRole('button', { name: /aplicar/i }));

    expect(await screen.findByText('Este cupom venceu.')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falha de rede cai na mensagem padrão em vez de travar', async () => {
    postMock.mockRejectedValue(new Error('offline'));
    render(<CouponField subtotal={300} applied={null} onChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), 'CICLO10');
    await userEvent.click(screen.getByRole('button', { name: /aplicar/i }));

    expect(await screen.findByText(/não foi possível conferir/i)).toBeInTheDocument();
  });

  it('digitar de novo limpa o erro anterior', async () => {
    postMock.mockRejectedValue(erroDaApi('Cupom não encontrado.'));
    render(<CouponField subtotal={300} applied={null} onChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), 'ERRADO');
    await userEvent.click(screen.getByRole('button', { name: /aplicar/i }));
    expect(await screen.findByText('Cupom não encontrado.')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox'), 'X');
    expect(screen.queryByText('Cupom não encontrado.')).not.toBeInTheDocument();
  });
});

describe('cupom já aplicado', () => {
  it('mostra o código e o desconto, com o sinal de abatimento', async () => {
    render(<CouponField subtotal={300} applied={{ code: 'CICLO10', discount: 30 }} onChange={vi.fn()} />);

    expect(screen.getByText('CICLO10')).toBeInTheDocument();
    expect(screen.getByText(/−\s*R\$\s*30,00/)).toBeInTheDocument();
  });

  it('remover avisa o pai com null', async () => {
    const onChange = vi.fn();
    render(<CouponField subtotal={300} applied={{ code: 'CICLO10', discount: 30 }} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /remover/i }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('não oferece o campo de digitar enquanto há cupom aplicado', () => {
    render(<CouponField subtotal={300} applied={{ code: 'CICLO10', discount: 30 }} onChange={vi.fn()} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('o carrinho mudou com cupom aplicado', () => {
  it('reconfere o cupom contra o novo subtotal', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CouponField subtotal={300} applied={{ code: 'CICLO10', discount: 30 }} onChange={onChange} />
    );

    postMock.mockResolvedValue({ data: { code: 'CICLO10', discount: 15 } });
    rerender(<CouponField subtotal={150} applied={{ code: 'CICLO10', discount: 30 }} onChange={onChange} />);

    // 10% de 150 são 15, não os 30 de antes.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ code: 'CICLO10', discount: 15 });
    });
  });

  it('cupom que deixou de valer sai, com o motivo à vista', async () => {
    // Cupom com mínimo de R$ 200: remover itens o derruba.
    //
    // Precisa de um pai com estado, e não de um `rerender` com `applied` fixo: a
    // mensagem de erro só existe no ramo "sem cupom aplicado". No app o pai
    // limpa `applied` ao receber `null`, e é nesse re-render que o motivo
    // aparece. Fixar `applied` testaria um fluxo que não acontece.
    postMock.mockRejectedValue(erroDaApi('Este cupom vale a partir de R$ 200,00.'));

    render(<PaiComEstado aplicadoInicial={{ code: 'CICLO10', discount: 30 }} />);
    expect(screen.getByText('CICLO10')).toBeInTheDocument();

    // O subtotal cai de 300 para 100 — é a mudança que dispara a reconferência.
    await userEvent.click(screen.getByRole('button', { name: /remover itens/i }));

    expect(await screen.findByText('Este cupom vale a partir de R$ 200,00.')).toBeInTheDocument();
    expect(screen.queryByText('CICLO10')).not.toBeInTheDocument();
  });

  it('sem cupom aplicado, mexer no carrinho não chama o servidor', async () => {
    const { rerender } = render(<CouponField subtotal={300} applied={null} onChange={vi.fn()} />);

    rerender(<CouponField subtotal={150} applied={null} onChange={vi.fn()} />);

    expect(postMock).not.toHaveBeenCalled();
  });
});
