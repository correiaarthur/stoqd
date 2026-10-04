import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerSale } from '../../src/lib/sales.js';
import { criarCliente, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * A FK que apagava faturamento.
 *
 * `Sale.customerId` estava em `ON DELETE CASCADE`, então remover um cliente
 * levava as vendas dele e, por cascata, os itens e as parcelas. Estes testes
 * exercitam o `ON DELETE` de verdade, contra o schema que vai para produção —
 * é por isso que o helper usa `migrate deploy` e não `db push`: um `db push`
 * poderia esconder justamente a diferença de FK.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

async function vendaPara(customerId: number | null) {
  const produto = await criarProduto({ quantidade: 10, preco: 100 });

  return testPrisma.$transaction(tx => registerSale(tx, {
    customerId,
    items: [{ productId: produto.id, quantity: 1 }],
    discount: 0,
    installmentsCount: customerId ? 3 : 1,
    paymentType: customerId ? 'PRAZO' : 'VISTA',
    observation: null,
  }));
}

describe('apagar um cliente', () => {
  it('não apaga as vendas dele — a venda aconteceu', async () => {
    const cliente = await criarCliente();
    const venda = await vendaPara(cliente.id);

    await testPrisma.customer.delete({ where: { id: cliente.id } });

    const aindaExiste = await testPrisma.sale.findUnique({ where: { id: venda.id } });
    expect(aindaExiste).not.toBeNull();
  });

  it('a venda perde o dono, não a existência', async () => {
    const cliente = await criarCliente();
    const venda = await vendaPara(cliente.id);

    await testPrisma.customer.delete({ where: { id: cliente.id } });

    const depois = await testPrisma.sale.findUnique({ where: { id: venda.id } });
    expect(depois?.customerId).toBeNull();
    expect(depois?.total).toBe(venda.total);
  });

  it('preserva itens e parcelas, pagas inclusive', async () => {
    const cliente = await criarCliente();
    const venda = await vendaPara(cliente.id);

    const primeira = venda.installments[0]!;
    await testPrisma.installment.update({
      where: { id: primeira.id },
      data: { paidAt: new Date() },
    });

    await testPrisma.customer.delete({ where: { id: cliente.id } });

    expect(await testPrisma.saleItem.count({ where: { saleId: venda.id } })).toBe(1);
    expect(await testPrisma.installment.count({ where: { saleId: venda.id } })).toBe(3);
    expect(await testPrisma.installment.count({ where: { saleId: venda.id, paidAt: { not: null } } })).toBe(1);
  });

  it('o faturamento continua no relatório', async () => {
    // O efeito que de fato se queria evitar: a receita saindo do Dashboard.
    const cliente = await criarCliente();
    await vendaPara(cliente.id);

    const antes = await testPrisma.sale.aggregate({ _sum: { total: true } });
    await testPrisma.customer.delete({ where: { id: cliente.id } });
    const depois = await testPrisma.sale.aggregate({ _sum: { total: true } });

    expect(depois._sum.total).toBe(antes._sum.total);
  });
});

describe('apagar uma venda', () => {
  it('leva itens e parcelas, que são partes dela', async () => {
    // O outro lado da decisão: SaleItem e Installment seguem em CASCADE de
    // propósito. Não existe parcela sem venda.
    const venda = await vendaPara(null);

    await testPrisma.sale.delete({ where: { id: venda.id } });

    expect(await testPrisma.saleItem.count({ where: { saleId: venda.id } })).toBe(0);
    expect(await testPrisma.installment.count({ where: { saleId: venda.id } })).toBe(0);
  });
});

describe('apagar um produto já vendido', () => {
  it('é recusado pelo banco — o item de venda o referencia', async () => {
    // `SaleItem.productId` não tem `onDelete`, então é RESTRICT. É o que impede
    // apagar produto com histórico, e vale travar: é fácil alguém "arrumar"
    // isso para CASCADE e abrir o mesmo buraco de novo.
    const produto = await criarProduto({ quantidade: 5, preco: 100 });

    await testPrisma.$transaction(tx => registerSale(tx, {
      customerId: null,
      items: [{ productId: produto.id, quantity: 1 }],
      discount: 0,
      installmentsCount: 1,
      paymentType: 'VISTA',
      observation: null,
    }));

    await expect(testPrisma.product.delete({ where: { id: produto.id } })).rejects.toThrow();
  });
});
