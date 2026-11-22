import type { Request, Response } from 'express';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { register } from '../../src/controllers/auth.controller.js';
import { orders } from '../../src/controllers/me.controller.js';
import { criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * A conta nunca é ligada ao cliente da loja pelo telefone digitado.
 *
 * O telefone não é segredo nem é verificado: ligar por ele entregaria o
 * histórico de compras, os valores e as parcelas em aberto de um cliente a
 * qualquer pessoa que digitasse o número dele no cadastro. O vínculo é feito
 * pela loja, ao confirmar um pedido.
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
  it('criar conta com o telefone de um cliente NÃO liga os dois, mesmo com pontuação diferente', async () => {
    await clienteComVenda('(87) 99641-5746');

    const { status, body } = await cadastrar('87996415746');
    expect(status).toBe(201);

    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: body.user!.id } });
    expect(user.customerId).toBeNull();
  });

  it('o histórico da conta não mostra as vendas de balcão de quem tem o mesmo telefone', async () => {
    await clienteComVenda('87996415746');
    const { body } = await cadastrar('87996415746');

    const historico = await chamar<{ linkedToCustomer: boolean; orders: unknown[] }>(
      orders, { auth: { role: 'customer', userId: body.user!.id } } as Partial<Request>,
    );

    expect(historico.body.linkedToCustomer).toBe(false);
    expect(historico.body.orders).toEqual([]);
  });

  it('ler o histórico também não liga a conta a um cliente criado depois', async () => {
    const { body } = await cadastrar('87996415746');
    await clienteComVenda('87996415746');

    const historico = await chamar<{ linkedToCustomer: boolean; orders: unknown[] }>(
      orders, { auth: { role: 'customer', userId: body.user!.id } } as Partial<Request>,
    );

    expect(historico.body.linkedToCustomer).toBe(false);
    expect(historico.body.orders).toEqual([]);

    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: body.user!.id } });
    expect(user.customerId).toBeNull();
  });

  it('quando a LOJA liga a conta ao cliente, o histórico de balcão aparece', async () => {
    const { cliente, venda } = await clienteComVenda('87996415746');
    const { body } = await cadastrar('87996415746');

    await testPrisma.user.update({ where: { id: body.user!.id }, data: { customerId: cliente.id } });

    const historico = await chamar<{ linkedToCustomer: boolean; orders: Array<{ source: string; saleId: number; items: Array<{ name: string }> }> }>(
      orders, { auth: { role: 'customer', userId: body.user!.id } } as Partial<Request>,
    );

    expect(historico.body.linkedToCustomer).toBe(true);
    expect(historico.body.orders).toHaveLength(1);
    expect(historico.body.orders[0]).toMatchObject({ source: 'SALE', saleId: venda.id });
    expect(historico.body.orders[0]!.items[0]!.name).toBe('Sabonete');
  });

  it('um telefone que já tem conta não abre outra', async () => {
    await cadastrar('87996415746');

    const segunda = await cadastrar('(87) 99641-5746', 'Outra pessoa');
    expect(segunda.status).toBe(409);
    expect(segunda.body.error).toMatch(/telefone/i);
  });
});
