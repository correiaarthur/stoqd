import type { Request, Response } from 'express';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { register } from '../../src/controllers/auth.controller.js';
import { orders } from '../../src/controllers/me.controller.js';
import { criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * Quem já era cliente da loja cria a conta com o telefone de sempre e encontra
 * o próprio histórico. E um telefone com conta não abre outra.
 */

beforeAll(() => {
  aplicarMigrations();
  process.env.JWT_SECRET ??= 'segredo-de-teste';
});
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

function chamar<T>(handler: (req: Request, res: Response) => Promise<unknown>, req: Partial<Request>) {
  const capturado = { status: 200, body: null as unknown };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
    send() { return res; },
  };
  return handler(req as Request, res as unknown as Response).then(() => ({ status: capturado.status, body: capturado.body as T }));
}

const cadastrar = (phone: string, name = 'Dayana') =>
  chamar<{ user?: { id: number }; error?: string }>(register, { body: { name, phone, password: 'senha-forte-123' } });

async function clienteComVenda(phone: string) {
  const produto = await criarProduto({ quantidade: 5, preco: 10, nome: 'Sabonete' });
  const cliente = await testPrisma.customer.create({ data: { name: 'Dayana Leite', phone } });
  const venda = await testPrisma.sale.create({
    data: { total: 20, customerId: cliente.id, items: { create: [{ productId: produto.id, quantity: 2, unitPrice: 10 }] } },
  });
  return { cliente, venda };
}

describe('vínculo da conta com o cliente da loja', () => {
  it('criar conta com o telefone de um cliente liga os dois, mesmo com pontuação diferente', async () => {
    const { cliente } = await clienteComVenda('(87) 99641-5746');

    const { status, body } = await cadastrar('87996415746');
    expect(status).toBe(201);

    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: body.user!.id } });
    expect(user.customerId).toBe(cliente.id);
  });

  it('o histórico da conta mostra as vendas de balcão do cliente', async () => {
    const { venda } = await clienteComVenda('87996415746');
    const { body } = await cadastrar('87996415746');

    const historico = await chamar<{ linkedToCustomer: boolean; orders: Array<{ source: string; saleId: number; items: Array<{ name: string }> }> }>(
      orders, { auth: { role: 'customer', userId: body.user!.id } } as Partial<Request>,
    );

    expect(historico.body.linkedToCustomer).toBe(true);
    expect(historico.body.orders).toHaveLength(1);
    expect(historico.body.orders[0]).toMatchObject({ source: 'SALE', saleId: venda.id });
    expect(historico.body.orders[0]!.items[0]!.name).toBe('Sabonete');
  });

  it('conta criada antes do cliente existir é ligada na primeira leitura do histórico', async () => {
    const { body } = await cadastrar('87996415746');
    await clienteComVenda('87996415746');

    const historico = await chamar<{ linkedToCustomer: boolean; orders: unknown[] }>(
      orders, { auth: { role: 'customer', userId: body.user!.id } } as Partial<Request>,
    );

    expect(historico.body.linkedToCustomer).toBe(true);
    expect(historico.body.orders).toHaveLength(1);
  });

  it('um telefone que já tem conta não abre outra', async () => {
    await cadastrar('87996415746');

    const segunda = await cadastrar('(87) 99641-5746', 'Outra pessoa');
    expect(segunda.status).toBe(409);
    expect(segunda.body.error).toMatch(/telefone/i);
  });

  it('um cliente que já tem dono não é ligado a uma segunda conta', async () => {
    await clienteComVenda('87996415746');
    await cadastrar('87996415746');

    const outra = await testPrisma.user.create({ data: { name: 'Outra', phone: '87000000000', passwordHash: 'x' } });
    expect(outra.customerId).toBeNull();
  });
});
