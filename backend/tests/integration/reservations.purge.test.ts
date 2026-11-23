import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getStockView, purgeExpiredReservations, purgeExpiredReservationsThrottled } from '../../src/lib/availability.js';
import { criarConta, criarPedidoPendente, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * Reserva vencida já não conta para o estoque; apagá-la só impede a tabela de
 * crescer. O que não pode acontecer é a limpeza apagar o que ainda vale.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

const MINUTO = 60 * 1000;

function reservar(productId: number, cartToken: string, expiraEm: number, extra: { orderId?: number } = {}) {
  return testPrisma.reservation.create({
    data: { productId, quantity: 1, cartToken, expiresAt: new Date(Date.now() + expiraEm), ...extra },
  });
}

describe('purgeExpiredReservations', () => {
  it('apaga só as vencidas de carrinho', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    await reservar(produto.id, 'carrinho-vencido-0001', -MINUTO);
    await reservar(produto.id, 'carrinho-vencido-0002', -60 * MINUTO);
    const viva = await reservar(produto.id, 'carrinho-vivo-000003', 5 * MINUTO);

    expect(await purgeExpiredReservations()).toBe(2);

    const restantes = await testPrisma.reservation.findMany();
    expect(restantes.map(r => r.id)).toEqual([viva.id]);
  });

  it('não apaga a reserva presa a um pedido, mesmo vencida', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const conta = await criarConta();
    const pedido = await criarPedidoPendente({ userId: conta.id, productId: produto.id, quantidade: 1, unitPrice: 10 });
    await reservar(produto.id, 'carrinho-do-pedido-01', -MINUTO, { orderId: pedido.id });

    expect(await purgeExpiredReservations()).toBe(0);
    expect(await testPrisma.reservation.count()).toBe(1);
  });

  it('não muda o estoque disponível: vencida já não contava', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    await reservar(produto.id, 'carrinho-vencido-0001', -MINUTO);
    await reservar(produto.id, 'carrinho-vivo-000003', 5 * MINUTO);

    const antes = (await getStockView([produto])).get(produto.id)!;
    await purgeExpiredReservations();
    const depois = (await getStockView([produto])).get(produto.id)!;

    expect(depois).toEqual(antes);
    expect(depois.reserved).toBe(1);
  });
});

describe('purgeExpiredReservationsThrottled', () => {
  it('roda no máximo uma vez por minuto', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const base = Date.now() + 10 * 60 * MINUTO; // à frente de qualquer chamada anterior no processo

    await purgeExpiredReservationsThrottled(base);

    await reservar(produto.id, 'carrinho-vencido-0001', -MINUTO);
    await purgeExpiredReservationsThrottled(base + 10 * 1000);
    expect(await testPrisma.reservation.count()).toBe(1);

    await purgeExpiredReservationsThrottled(base + 61 * 1000);
    expect(await testPrisma.reservation.count()).toBe(0);
  });
});
