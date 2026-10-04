import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SaleError, registerSale } from '../../src/lib/sales.js';
import { criarCliente, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * A1 — duas vendas simultâneas do mesmo item.
 *
 * `registerSale` lê a quantidade, compara, e só então decrementa. Entre a
 * leitura e a escrita cabe outra transação fazendo o mesmo: as duas veem
 * "1 unidade disponível", as duas passam na checagem, e o estoque termina em
 * −1. O produto fica vendido duas vezes e só uma pessoa recebe.
 *
 * Isto não é teórico: é o caminho do balcão em dia de movimento, e o padrão da
 * correção já existe no próprio projeto, em `consumeCoupon` — `updateMany`
 * condicional, recusando quando nenhuma linha é afetada.
 *
 * O teste é escrito para **falhar enquanto o bug existir**. É a definição do
 * conserto, não a descrição do comportamento atual.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

/** Fecha uma venda numa transação própria, como o controller faz. */
function venderEmTransacao(productId: number, quantidade: number, customerId: number | null) {
  return testPrisma.$transaction(tx => registerSale(tx, {
    customerId,
    items: [{ productId, quantity: quantidade }],
    discount: 0,
    installmentsCount: 1,
    paymentType: 'VISTA',
    observation: null,
  }));
}

describe('registerSale em sequência', () => {
  it('baixa o estoque', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 100 });

    await venderEmTransacao(produto.id, 2, null);

    const depois = await testPrisma.product.findUnique({ where: { id: produto.id } });
    expect(depois?.quantity).toBe(3);
  });

  it('recusa quando o pedido passa do estoque', async () => {
    const produto = await criarProduto({ quantidade: 1, preco: 100 });

    await expect(venderEmTransacao(produto.id, 2, null)).rejects.toThrow(SaleError);

    const depois = await testPrisma.product.findUnique({ where: { id: produto.id } });
    expect(depois?.quantity).toBe(1);
  });

  it('esgota exatamente em zero, nunca abaixo', async () => {
    const produto = await criarProduto({ quantidade: 2, preco: 100 });

    await venderEmTransacao(produto.id, 2, null);
    await expect(venderEmTransacao(produto.id, 1, null)).rejects.toThrow(SaleError);

    const depois = await testPrisma.product.findUnique({ where: { id: produto.id } });
    expect(depois?.quantity).toBe(0);
  });

  it('cobra o preço promocional quando existe', async () => {
    const produto = await criarProduto({ quantidade: 3, preco: 100, promocional: 79.9 });

    const venda = await venderEmTransacao(produto.id, 2, null);

    expect(venda.total).toBe(159.8);
    expect(venda.items[0]?.unitPrice).toBe(79.9);
  });

  it('venda a prazo exige cliente', async () => {
    const produto = await criarProduto({ quantidade: 3 });

    await expect(testPrisma.$transaction(tx => registerSale(tx, {
      customerId: null,
      items: [{ productId: produto.id, quantity: 1 }],
      discount: 0,
      installmentsCount: 3,
      paymentType: 'PRAZO',
      observation: null,
    }))).rejects.toThrow(SaleError);
  });

  it('a prazo gera as parcelas e elas somam o total', async () => {
    const produto = await criarProduto({ quantidade: 3, preco: 100 });
    const cliente = await criarCliente();

    const venda = await venderEmTransacao(produto.id, 1, cliente.id).catch(() => null);
    expect(venda).not.toBeNull();

    const aPrazo = await testPrisma.$transaction(tx => registerSale(tx, {
      customerId: cliente.id,
      items: [{ productId: produto.id, quantity: 1 }],
      discount: 0,
      installmentsCount: 3,
      paymentType: 'PRAZO',
      observation: null,
    }));

    const soma = aPrazo.installments.reduce((a, p) => a + Math.round(p.value * 100), 0);
    expect(soma).toBe(Math.round(aPrazo.total * 100));
    expect(aPrazo.installments).toHaveLength(3);
    expect(aPrazo.installments.every(p => p.paidAt === null)).toBe(true);
  });
});

describe('registerSale sob concorrência — A1', () => {
  it('duas vendas simultâneas da última unidade: uma só pode passar', async () => {
    const produto = await criarProduto({ quantidade: 1, preco: 100 });

    const resultados = await Promise.allSettled([
      venderEmTransacao(produto.id, 1, null),
      venderEmTransacao(produto.id, 1, null),
    ]);

    const okCount = resultados.filter(r => r.status === 'fulfilled').length;
    const depois = await testPrisma.product.findUnique({ where: { id: produto.id } });

    // O que o banco mostra importa mais que o que a API respondeu: estoque
    // negativo significa produto vendido que não existe.
    expect(depois?.quantity).toBeGreaterThanOrEqual(0);
    expect(okCount).toBe(1);
  });

  it('cinco vendas simultâneas de 1 unidade com estoque 3: exatamente 3 passam', async () => {
    const produto = await criarProduto({ quantidade: 3, preco: 50 });

    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () => venderEmTransacao(produto.id, 1, null))
    );

    const okCount = resultados.filter(r => r.status === 'fulfilled').length;
    const depois = await testPrisma.product.findUnique({ where: { id: produto.id } });
    const vendas = await testPrisma.sale.count();

    expect(depois?.quantity).toBe(0);
    expect(okCount).toBe(3);
    // Nenhuma venda a mais do que havia produto: a soma vendida não pode
    // passar do estoque inicial.
    expect(vendas).toBe(3);
  });

  it('o total de unidades vendidas nunca passa do estoque inicial', async () => {
    const produto = await criarProduto({ quantidade: 4, preco: 25 });

    await Promise.allSettled(
      Array.from({ length: 6 }, () => venderEmTransacao(produto.id, 2, null))
    );

    const vendidas = await testPrisma.saleItem.aggregate({ _sum: { quantity: true } });
    expect(vendidas._sum.quantity ?? 0).toBeLessThanOrEqual(4);
  });
});
