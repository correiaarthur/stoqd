import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CouponTable } from '../CouponTable';
import { discountOf, ruleOf } from '../couponFormat';
import { PlanCell } from '../PlanCell';
import { PlanExample } from '../PlanExample';
import { SimulationBar } from '../SimulationBar';
import type { Coupon, Plan } from '../types';

const cupom = (over: Partial<Coupon> = {}): Coupon => ({
  id: 1, code: 'CICLO10', type: 'PERCENT', value: 10, minimumTotal: null, expiresAt: null,
  maxUses: null, usedCount: 0, active: true, status: 'active', ...over,
});

const NBSP = '\u00A0';

describe('couponFormat', () => {
  it('o desconto se lê como percentual ou em reais', () => {
    expect(discountOf(cupom({ type: 'PERCENT', value: 15 }))).toBe('15%');
    expect(discountOf(cupom({ type: 'FIXED', value: 5 }))).toBe(`R$${NBSP}5,00`);
  });

  it('as regras cabem numa linha: mínimo e validade', () => {
    expect(ruleOf(cupom())).toBe('sem mínimo');
    expect(ruleOf(cupom({ minimumTotal: 80, expiresAt: new Date(2026, 8, 30, 12).toISOString() })))
      .toBe(`pedido mínimo R$${NBSP}80,00 · até 30/09/2026`);
  });
});

describe('CouponTable', () => {
  const handlers = () => ({ onEdit: vi.fn(), onToggle: vi.fn(), onRemove: vi.fn() });

  it('carregando: esqueleto, sem tabela', () => {
    render(<CouponTable coupons={[]} loading editingId={null} newId={null} {...handlers()} />);
    expect(screen.getByRole('status', { name: 'Carregando cupons' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sem cupons: convida a criar o primeiro', () => {
    render(<CouponTable coupons={[]} loading={false} editingId={null} newId={null} {...handlers()} />);
    expect(screen.getByText(/Nenhum cupom criado ainda/)).toBeInTheDocument();
  });

  it('uma linha por cupom, com usos e situação', () => {
    render(
      <CouponTable
        coupons={[cupom({ id: 1, code: 'A', maxUses: 10, usedCount: 4 }), cupom({ id: 2, code: 'B', status: 'expired', active: false })]}
        loading={false} editingId={null} newId={null} {...handlers()}
      />
    );

    expect(screen.getAllByRole('row')).toHaveLength(3); // cabeçalho + 2
    expect(screen.getByText('4 de 10')).toBeInTheDocument();
    expect(screen.getByText('0 · ilimitado')).toBeInTheDocument();
    expect(screen.getByText('Valendo')).toBeInTheDocument();
    expect(screen.getByText('Vencido')).toBeInTheDocument();
  });

  it('marca a linha em edição e a recém-criada', () => {
    render(
      <CouponTable coupons={[cupom({ id: 1, code: 'A' }), cupom({ id: 2, code: 'B' })]}
        loading={false} editingId={1} newId={2} {...handlers()} />
    );

    const [, linhaA, linhaB] = screen.getAllByRole('row');
    expect(linhaA).toHaveClass('is-selected');
    expect(linhaB).toHaveClass('is-new');
    expect(screen.getByText('Novo')).toBeInTheDocument();
  });

  it('clicar na linha edita; os botões da linha não disparam a edição da linha', async () => {
    const h = handlers();
    const c = cupom({ id: 1, code: 'A' });
    render(<CouponTable coupons={[c]} loading={false} editingId={null} newId={null} {...h} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('A'));
    expect(h.onEdit).toHaveBeenCalledTimes(1);

    h.onEdit.mockClear();
    await user.click(screen.getByRole('button', { name: 'Desativar A' }));
    await user.click(screen.getByRole('button', { name: 'Apagar A' }));

    expect(h.onToggle).toHaveBeenCalledWith(c);
    expect(h.onRemove).toHaveBeenCalledWith(c);
    expect(h.onEdit).not.toHaveBeenCalled();
  });

  it('cupom desligado oferece Reativar', () => {
    render(<CouponTable coupons={[cupom({ code: 'A', active: false, status: 'inactive' })]}
      loading={false} editingId={null} newId={null} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'Reativar A' })).toBeInTheDocument();
  });
});

describe('PlanExample', () => {
  const plano = (interestPercent: number): Plan => ({ installments: 3, interestPercent, active: true });

  it('sem valor simulado, não mostra nada', () => {
    const { container } = render(<PlanExample plan={plano(0)} saved={plano(0)} base={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem juros: só a parcela', () => {
    render(<PlanExample plan={plano(0)} saved={plano(0)} base={300} />);
    expect(screen.getByText(/100,00\/parcela/)).toBeInTheDocument();
    expect(screen.queryByText(/total/)).toBeNull();
  });

  it('com juros: parcela e total', () => {
    render(<PlanExample plan={plano(10)} saved={plano(10)} base={300} />);
    expect(screen.getByText(/110,00\/parcela/)).toBeInTheDocument();
    expect(screen.getByText(/total R\$.*330,00/)).toBeInTheDocument();
  });

  it('taxa mexida e não salva: mostra o antes e a diferença', () => {
    render(<PlanExample plan={plano(10)} saved={plano(0)} base={300} />);
    expect(screen.getByText(/antes .*100,00.*\(0%\)/)).toBeInTheDocument();
    expect(screen.getByText(/\+.*10,00/)).toBeInTheDocument();
  });

  it('taxa igual à salva: nada de "antes"', () => {
    render(<PlanExample plan={plano(10)} saved={plano(10)} base={300} />);
    expect(screen.queryByText(/antes/)).toBeNull();
  });
});

describe('PlanCell', () => {
  const plano = (over: Partial<Plan> = {}): Plan => ({ installments: 6, interestPercent: 0, active: true, ...over });

  it('faixa ligada e sem juros', () => {
    render(<PlanCell plan={plano()} saved={plano()} base={0} onRate={vi.fn()} />);
    expect(screen.getByText('6x')).toBeInTheDocument();
    expect(screen.getByText('sem juros')).toBeInTheDocument();
  });

  it('faixa com juros', () => {
    render(<PlanCell plan={plano({ interestPercent: 3 })} saved={plano()} base={0} onRate={vi.fn()} />);
    expect(screen.getByText('com juros')).toBeInTheDocument();
  });

  it('faixa desligada: apagada, campo travado e sem simulação', () => {
    const { container } = render(<PlanCell plan={plano({ active: false })} saved={plano()} base={300} onRate={vi.fn()} />);

    expect(screen.getByText('acima do limite')).toBeInTheDocument();
    expect(screen.getByLabelText('Juros em 6x')).toBeDisabled();
    expect(container.querySelector('.plan-cell')).toHaveClass('off');
    expect(container.querySelector('.plan-example')).toBeNull();
  });

  it('digitar a taxa entrega o número, e texto solto vira 0', () => {
    const onRate = vi.fn();
    render(<PlanCell plan={plano()} saved={plano()} base={0} onRate={onRate} />);

    fireEvent.change(screen.getByLabelText('Juros em 6x'), { target: { value: '2,5' } });
    expect(onRate).toHaveBeenLastCalledWith(6, 2.5);

    fireEvent.change(screen.getByLabelText('Juros em 6x'), { target: { value: 'abc' } });
    expect(onRate).toHaveBeenLastCalledWith(6, 0);
  });
});

describe('SimulationBar', () => {
  function Wrapper({ inicial = '300.00' }: { inicial?: string }) {
    const [valor, setValor] = useState(inicial);
    return <><SimulationBar value={valor} onChange={setValor} /><output>{valor}</output></>;
  }

  it('mostra o valor como dinheiro e marca o atalho que corresponde a ele', () => {
    render(<Wrapper />);

    expect(screen.getByLabelText('Simular com um pedido de')).toHaveValue(`R$${NBSP}300,00`);
    expect(screen.getByRole('button', { name: /300/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /500/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('um atalho troca o valor', async () => {
    render(<Wrapper />);
    await userEvent.setup().click(screen.getByRole('button', { name: /1\.000|1000/ }));

    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('1000.00');
  });

  it('digitar lê centavos, como os outros campos de dinheiro', () => {
    render(<Wrapper inicial="" />);

    fireEvent.change(screen.getByLabelText('Simular com um pedido de'), { target: { value: '45990' } });

    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('459.90');
  });

  it('vazio mostra o campo em branco', () => {
    render(<Wrapper inicial="" />);
    expect(screen.getByLabelText('Simular com um pedido de')).toHaveValue('');
  });
});
