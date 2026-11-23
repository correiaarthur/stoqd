import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  getMe: vi.fn(),
  getMyOrders: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
  deleteMe: vi.fn(),
}));

vi.mock('../../services/account', () => services);

import { MyAccount } from '../MyAccount';
import { TOKEN_KEY } from '../../utils/auth';

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.removeItem(TOKEN_KEY); });

const conta = { id: 1, name: 'Dayana Leite', email: null, phone: '87996415746', createdAt: '2026-01-10T12:00:00.000Z' };

const pedido = (over: Record<string, unknown> = {}) => ({
  source: 'ORDER', id: 7, status: 'CONFIRMED', createdAt: '2026-02-01T12:00:00.000Z', cancelReason: null, saleId: 3,
  total: 100, discount: 0, interest: 0, couponCode: null, pendingAmount: 0, isPaid: true,
  items: [{ name: 'Sabonete', quantity: 1, unitPrice: 100 }], installments: [], ...over,
});

function montar(url = '/minha-conta') {
  return render(<MemoryRouter initialEntries={[url]}><MyAccount /></MemoryRouter>);
}

describe('MyAccount', () => {
  it('busca a conta e o histórico juntos e mostra o primeiro nome', async () => {
    services.getMe.mockResolvedValue({ data: conta });
    services.getMyOrders.mockResolvedValue({ data: { orders: [pedido()] } });
    montar();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Olá, Dayana.');
    expect(services.getMe).toHaveBeenCalledTimes(1);
    expect(services.getMyOrders).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Sabonete')).toBeInTheDocument();
  });

  it('enquanto carrega mostra o esqueleto, não o conteúdo', () => {
    services.getMe.mockReturnValue(new Promise(() => {}));
    services.getMyOrders.mockReturnValue(new Promise(() => {}));
    montar();

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.querySelector('.skeleton')).not.toBeNull();
  });

  it('falha ao carregar: avisa, em vez de uma tela em branco', async () => {
    services.getMe.mockRejectedValue(new Error('rede'));
    services.getMyOrders.mockResolvedValue({ data: { orders: [] } });
    montar();

    expect(await screen.findByText('Não foi possível carregar sua conta.')).toBeInTheDocument();
  });

  it('sem pedidos, diz isso', async () => {
    services.getMe.mockResolvedValue({ data: conta });
    services.getMyOrders.mockResolvedValue({ data: { orders: [] } });
    montar();

    expect(await screen.findByText('Você ainda não fez nenhum pedido.')).toBeInTheDocument();
  });

  it('resposta sem a lista de pedidos vira lista vazia', async () => {
    services.getMe.mockResolvedValue({ data: conta });
    services.getMyOrders.mockResolvedValue({ data: {} });
    montar();

    expect(await screen.findByText('Você ainda não fez nenhum pedido.')).toBeInTheDocument();
  });

  it('?pedido=enviado mostra o aviso de pedido enviado', async () => {
    services.getMe.mockResolvedValue({ data: conta });
    services.getMyOrders.mockResolvedValue({ data: { orders: [] } });
    montar('/minha-conta?pedido=enviado');

    expect(await screen.findByText(/Pedido enviado\. A loja recebeu o aviso/)).toBeInTheDocument();
  });

  it('salvar o perfil atualiza o nome na tela sem buscar tudo de novo', async () => {
    services.getMe.mockResolvedValue({ data: conta });
    services.getMyOrders.mockResolvedValue({ data: { orders: [pedido()] } });
    services.updateMe.mockResolvedValue({ data: { ...conta, name: 'Marina Souza' } });
    montar();
    const user = userEvent.setup();

    await screen.findByRole('heading', { level: 1 });
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Marina Souza');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Olá, Marina.'));
    expect(services.updateMe).toHaveBeenCalledWith(expect.objectContaining({ name: 'Marina Souza' }));
    expect(services.getMe).toHaveBeenCalledTimes(1);
    expect(services.getMyOrders).toHaveBeenCalledTimes(1);
    // O histórico continua ali: salvar o perfil não pode apagar os pedidos.
    expect(screen.getByText('Sabonete')).toBeInTheDocument();
  });

  it('a próxima parcela aparece com o valor, entre os pedidos confirmados', async () => {
    services.getMe.mockResolvedValue({ data: conta });
    services.getMyOrders.mockResolvedValue({ data: { orders: [pedido({
      isPaid: false, pendingAmount: 80,
      installments: [
        { number: 1, value: 20, dueDate: '2026-03-10T12:00:00.000Z', paidAt: '2026-03-10T12:00:00.000Z' },
        { number: 2, value: 80, dueDate: '2026-04-10T12:00:00.000Z', paidAt: null },
      ],
    })] } });
    montar();

    expect(await screen.findByText('Próxima parcela')).toBeInTheDocument();
    expect(screen.getByText(/vence em 10\/04/)).toBeInTheDocument();
  });
});


describe('MyAccount — trocar a senha', () => {
  async function abrir() {
    services.getMe.mockResolvedValue({ data: conta });
    services.getMyOrders.mockResolvedValue({ data: { orders: [] } });
    montar();
    await screen.findByRole('heading', { level: 1 });
    return userEvent.setup();
  }

  const preencher = async (user: ReturnType<typeof userEvent.setup>, atual: string, nova: string) => {
    await user.type(screen.getByLabelText('Senha atual'), atual);
    await user.type(screen.getByLabelText('Nova senha'), nova);
    await user.click(screen.getByRole('button', { name: /alterar senha|trocar senha|salvar senha/i }));
  };

  it('guarda o token novo que o servidor devolve: as outras sessões caíram, esta continua', async () => {
    localStorage.setItem(TOKEN_KEY, 'token-antigo');
    services.changePassword.mockResolvedValue({ data: { token: 'token-novo' } });
    const user = await abrir();

    await preencher(user, 'senha-velha-1', 'senha-nova-123');

    expect(services.changePassword).toHaveBeenCalledWith('senha-velha-1', 'senha-nova-123');
    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBe('token-novo'));
    expect(await screen.findByText('Senha alterada.')).toBeInTheDocument();
  });

  it('limpa os campos depois de trocar', async () => {
    services.changePassword.mockResolvedValue({ data: { token: 'token-novo' } });
    const user = await abrir();

    await preencher(user, 'senha-velha-1', 'senha-nova-123');

    await screen.findByText('Senha alterada.');
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
  });

  it('com a senha atual errada, mostra o erro e mantém o token que já tinha', async () => {
    localStorage.setItem(TOKEN_KEY, 'token-antigo');
    services.changePassword.mockRejectedValue(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400, statusText: 'Bad Request', headers: {}, config: {} as never, data: { error: 'A senha atual não confere.' },
      })
    );
    const user = await abrir();

    await preencher(user, 'errada-errada', 'senha-nova-123');

    expect(await screen.findByRole('alert')).toHaveTextContent('A senha atual não confere.');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-antigo');
    expect(screen.queryByText('Senha alterada.')).toBeNull();
  });
});
