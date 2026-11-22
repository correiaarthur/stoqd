import type { Request, Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { confirm, create } from '../../src/controllers/orders.controller.js';
import { criarConta, criarPedidoPendente, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * Parcelamento fracionário, zero ou negativo.
 *
 * Antes, `Number(x) || 1` deixava `0.5` e `-3` passarem: a taxa de "1x ou menos"
 * é 0%, o pedido era aceito, e a confirmação criava uma venda a prazo com total
 * e **nenhuma parcela** — a dívida sumia da lista de clientes.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

function chamar(handler: (req: Request, res: Response) => Promise<unknown>, req: Record<string, unknown>) {
  const capturado = { status: 200, body: null as unknown };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
  };
  return handler(req as unknown as Request, res as unknown as Response).then(() => capturado);
}

const pedirComParcelas = (userId: number, productId: number, installmentsCount: unknown) =>
  chamar(create, {
    auth: { role: 'customer', userId },
    body: { items: [{ productId, quantity: 1 }], paymentType: 'PRAZO', installmentsCount },
  });

describe('criar o pedido', () => {
  it.each([0.5, -3, 1.5, 13, 'abc'])('recusa %s parcelas e não grava o pedido', async (parcelas) => {
    const produto = await criarProduto({ quantidade: 5, preco: 100 });
    const conta = await criarConta();

    const r = await pedirComParcelas(conta.id, produto.id, parcelas);

    expect(r.status).toBe(400);
    expect(await testPrisma.order.count()).toBe(0);
  });

  it('sem informar as parcelas vale 1x, e o pedido nasce', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 100 });
    const conta = await criarConta();

    const r = await pedirComParcelas(conta.id, produto.id, undefined);

    expect(r.status).toBe(201);
    expect((await testPrisma.order.findFirstOrThrow()).installmentsCount).toBe(1);
  });
});

describe('confirmar o pedido', () => {
  it.each([0.5, -3, 0])('o admin não consegue forçar %s parcelas; o pedido segue pendente', async (parcelas) => {
    const produto = await criarProduto({ quantidade: 5, preco: 100 });
    const conta = await criarConta();
    const pedido = await criarPedidoPendente({ userId: conta.id, productId: produto.id, quantidade: 1, unitPrice: 100 });

    const r = await chamar(confirm, {
      params: { id: String(pedido.id) },
      body: { createCustomer: true, paymentType: 'PRAZO', installmentsCount: parcelas },
    });

    expect(r.status).toBe(400);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe('PENDING');
    expect(await testPrisma.sale.count()).toBe(0);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: produto.id } })).quantity).toBe(5);
  });
});
