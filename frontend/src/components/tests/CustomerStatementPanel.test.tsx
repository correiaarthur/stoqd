import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  getCustomerStatement: vi.fn(),
  payInstallment: vi.fn(),
  updateCustomer: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('../../services/customers', () => services);
vi.mock('../../contexts/toast', () => ({ useToast: () => toast }));

import { CustomerStatementPanel } from '../CustomerStatementPanel';

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

/** Um cliente com uma venda a prazo: uma parcela vencida e aberta, uma já paga. */
const extrato = (over: { overdue?: boolean } = {}) => ({
  id: 5, name: 'Ana Ribeiro', phone: '11988887777', email: null,
  sales: [{
    id: 12, total: 100, date: '2026-03-10T12:00:00.000Z', observation: null, discount: null, interest: null,
    items: [{ id: 1, quantity: 2, unitPrice: 50, productId: 1, product: { name: 'Sabonete' } }],
    installments: [
      { id: 101, number: 1, value: 60, dueDate: over.overdue === false ? '2099-01-01T12:00:00.000Z' : '2000-01-01T12:00:00.000Z', paidAt: null, saleId: 12 },
      { id: 102, number: 2, value: 40, dueDate: '2000-02-01T12:00:00.000Z', paidAt: '2000-02-01T12:00:00.000Z', saleId: 12 },
    ],
  }],
});

function montar(props: Partial<React.ComponentProps<typeof CustomerStatementPanel>> = {}) {
  const onClose = vi.fn();
  const onRefresh = vi.fn();
  const view = render(
    <CustomerStatementPanel customerId={5} name="Ana" onClose={onClose} onRefresh={onRefresh} {...props} />
  );
  return { onClose, onRefresh, ...view };
}

describe('CustomerStatementPanel', () => {
  it('mostra o nome que a lista já conhecia enquanto o extrato carrega, e o esqueleto', async () => {
    services.getCustomerStatement.mockReturnValue(new Promise(() => {}));
    montar();

    expect(screen.getByRole('heading', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByText('Carregando histórico...')).toBeInTheDocument();
  });

  it('com o extrato, mostra quanto deve e quanto já comprou', async () => {
    services.getCustomerStatement.mockResolvedValue({ data: extrato() });
    montar();

    expect(await screen.findByText('Deve no total')).toBeInTheDocument();
    // O Testing Library normaliza o espaço do "R$" antes de comparar: a regex aceita qualquer um.
    expect(screen.getByText(/^R[$]\s60,00$/, { selector: 'strong' })).toBeInTheDocument(); // o que está aberto
    expect(screen.getByText(/^R[$]\s100,00$/, { selector: 'strong' })).toBeInTheDocument(); // o que já comprou
    expect(screen.getByRole('heading', { name: 'Ana Ribeiro' })).toBeInTheDocument();
    expect(services.getCustomerStatement).toHaveBeenCalledWith(5);
  });

  it('sem cliente escolhido não mostra nada e não busca', () => {
    const { container } = montar({ customerId: null });

    expect(container).toBeEmptyDOMElement();
    expect(services.getCustomerStatement).not.toHaveBeenCalled();
  });

  it('falha ao carregar: avisa com a mensagem da API e fecha o painel', async () => {
    services.getCustomerStatement.mockRejectedValue(new Error('rede'));
    const { onClose } = montar();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith('Erro ao carregar o histórico do cliente.');
  });

  it('a parcela vencida oferece "Dar baixa"; pagar recarrega o extrato e avisa a lista', async () => {
    services.getCustomerStatement.mockResolvedValue({ data: extrato() });
    services.payInstallment.mockResolvedValue({});
    const { onRefresh } = montar();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Dar baixa' }));

    expect(services.payInstallment).toHaveBeenCalledWith(101);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(services.getCustomerStatement).toHaveBeenCalledTimes(2);
  });

  it('sem parcela vencida, não há "Dar baixa"', async () => {
    services.getCustomerStatement.mockResolvedValue({ data: extrato({ overdue: false }) });
    montar();

    await screen.findByText('Deve no total');
    expect(screen.queryByRole('button', { name: 'Dar baixa' })).toBeNull();
  });

  it('as compras chegam fechadas, abrem pelo cabeçalho e fecham de novo depois de uma baixa', async () => {
    services.getCustomerStatement.mockResolvedValue({ data: extrato() });
    services.payInstallment.mockResolvedValue({});
    montar();
    const user = userEvent.setup();

    const cabecalho = await screen.findByRole('button', { name: /Venda #12/ });
    expect(cabecalho).toHaveAttribute('aria-expanded', 'false');

    await user.click(cabecalho);
    expect(screen.getByRole('button', { name: /Venda #12/ })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Dar baixa' }));
    await waitFor(() => expect(services.getCustomerStatement).toHaveBeenCalledTimes(2));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Venda #12/ })).toHaveAttribute('aria-expanded', 'false')
    );
  });

  it('erro ao dar baixa: avisa, não avisa a lista e mantém o painel aberto', async () => {
    services.getCustomerStatement.mockResolvedValue({ data: extrato() });
    services.payInstallment.mockRejectedValue(new Error('rede'));
    const { onRefresh, onClose } = montar();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Dar baixa' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao processar a baixa da parcela.'));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('trocar de cliente busca o novo extrato; a resposta lenta do anterior não o sobrescreve', async () => {
    let soltarAnterior!: (value: unknown) => void;
    services.getCustomerStatement
      .mockReturnValueOnce(new Promise(resolve => { soltarAnterior = resolve; }))
      .mockResolvedValueOnce({ data: { ...extrato(), id: 6, name: 'Bruno Carvalho' } });

    const { rerender } = montar({ customerId: 5 });
    rerender(<CustomerStatementPanel customerId={6} name="Bruno" onClose={vi.fn()} onRefresh={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Bruno Carvalho' })).toBeInTheDocument();

    await act(async () => { soltarAnterior({ data: extrato() }); });

    expect(screen.getByRole('heading', { name: 'Bruno Carvalho' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ana Ribeiro' })).toBeNull();
  });
});
