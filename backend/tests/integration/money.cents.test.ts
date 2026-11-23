import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getAll } from '../../src/controllers/customers.controller.js';
import { criarCliente, criarMarca, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * Dinheiro no banco é centavos inteiros; no código, reais.
 *
 * Estes testes olham o que o banco **realmente guarda** (com SQL cru, que não passa
 * pela conversão) e o que volta pelo Prisma. A conversão é transparente para quem
 * usa o client; o que precisa ser provado é que o banco tem o inteiro certo.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

const cru = async <T>(consulta: Promise<T>) => consulta;

describe('o que o banco guarda', () => {
  it('o preço do produto é um inteiro em centavos; o Prisma devolve reais', async () => {
    const marca = await criarMarca();
    const produto = await testPrisma.product.create({
      data: { name: 'Sabonete', brandId: marca.id, sellingPrice: 59.9, promotionalPrice: 49.9 },
    });

    const [linha] = await cru(testPrisma.$queryRaw<Array<{ sellingPrice: number; promotionalPrice: number; tipo: string }>>`
      SELECT "sellingPrice", "promotionalPrice", pg_typeof("sellingPrice")::text AS tipo FROM "Product" WHERE id = ${produto.id}
    `);

    expect(linha).toEqual({ sellingPrice: 5990, promotionalPrice: 4990, tipo: 'integer' });
    expect(produto).toMatchObject({ sellingPrice: 59.9, promotionalPrice: 49.9 });
    expect(await testPrisma.product.findUniqueOrThrow({ where: { id: produto.id } })).toMatchObject({ sellingPrice: 59.9, promotionalPrice: 49.9 });
  });

  it('a venda criada com itens e parcelas de uma vez grava tudo em centavos', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const venda = await testPrisma.sale.create({
      data: {
        total: 90.5, discount: 9.5, interest: 0,
        items: { create: [{ productId: produto.id, quantity: 2, unitPrice: 50 }] },
        installments: { create: [{ number: 1, value: 45.25, dueDate: new Date() }, { number: 2, value: 45.25, dueDate: new Date() }] },
      },
      include: { items: true, installments: true },
    });

    const [s] = await testPrisma.$queryRaw<Array<{ total: number; discount: number; interest: number }>>`SELECT total, discount, interest FROM "Sale" WHERE id = ${venda.id}`;
    const itens = await testPrisma.$queryRaw<Array<{ unitPrice: number }>>`SELECT "unitPrice" FROM "SaleItem" WHERE "saleId" = ${venda.id}`;
    const parcelas = await testPrisma.$queryRaw<Array<{ value: number }>>`SELECT value FROM "Installment" WHERE "saleId" = ${venda.id} ORDER BY number`;

    expect(s).toEqual({ total: 9050, discount: 950, interest: 0 });
    expect(itens).toEqual([{ unitPrice: 5000 }]);
    expect(parcelas).toEqual([{ value: 4525 }, { value: 4525 }]);

    // E volta em reais, inclusive a escrita aninhada que o `create` devolveu.
    expect(venda).toMatchObject({ total: 90.5, discount: 9.5 });
    expect(venda.items[0]!.unitPrice).toBe(50);
    expect(venda.installments.map(i => i.value)).toEqual([45.25, 45.25]);
  });

  it('cupom: percentual e valor fixo usam centésimos', async () => {
    const percentual = await testPrisma.coupon.create({ data: { code: 'PCT', type: 'PERCENT', value: 12.5, minimumTotal: 80 } });
    const fixo = await testPrisma.coupon.create({ data: { code: 'FIXO', type: 'FIXED', value: 5 } });

    const linhas = await testPrisma.$queryRaw<Array<{ code: string; value: number; minimumTotal: number | null }>>`SELECT code, value, "minimumTotal" FROM "Coupon" ORDER BY code`;

    expect(linhas).toEqual([
      { code: 'FIXO', value: 500, minimumTotal: null },
      { code: 'PCT', value: 1250, minimumTotal: 8000 },
    ]);
    expect(percentual).toMatchObject({ value: 12.5, minimumTotal: 80 });
    expect(fixo).toMatchObject({ value: 5, minimumTotal: null });
  });

  it('o custo médio NÃO é convertido: é uma estimativa e guarda a fração de centavo', async () => {
    const marca = await criarMarca();
    const produto = await testPrisma.product.create({ data: { name: 'Média', brandId: marca.id, averageCost: 12.3333 } });

    const [linha] = await testPrisma.$queryRaw<Array<{ averageCost: number }>>`SELECT "averageCost" FROM "Product" WHERE id = ${produto.id}`;

    expect(linha!.averageCost).toBeCloseTo(12.3333, 6);
    expect(produto.averageCost).toBeCloseTo(12.3333, 6);
  });

  it('o valor é arredondado ao centavo na escrita: não existe fração de centavo no banco', async () => {
    const marca = await criarMarca();
    const produto = await testPrisma.product.create({ data: { name: 'Fração', brandId: marca.id, sellingPrice: 10.005 } });

    const [linha] = await testPrisma.$queryRaw<Array<{ sellingPrice: number }>>`SELECT "sellingPrice" FROM "Product" WHERE id = ${produto.id}`;

    expect(linha!.sellingPrice).toBe(1001);
    expect(produto.sellingPrice).toBe(10.01);
  });

  it('dentro de uma transação interativa a conversão também vale', async () => {
    const marca = await criarMarca();

    const produto = await testPrisma.$transaction(async tx => tx.product.create({ data: { name: 'Em transação', brandId: marca.id, sellingPrice: 7.7 } }));

    const [linha] = await testPrisma.$queryRaw<Array<{ sellingPrice: number }>>`SELECT "sellingPrice" FROM "Product" WHERE id = ${produto.id}`;
    expect(linha!.sellingPrice).toBe(770);
    expect(produto.sellingPrice).toBe(7.7);
  });

  it('createMany, update, upsert e updateMany convertem', async () => {
    const marca = await criarMarca();
    await testPrisma.product.createMany({ data: [{ name: 'A', brandId: marca.id, sellingPrice: 1.1 }, { name: 'B', brandId: marca.id, sellingPrice: 2.2 }] });
    await testPrisma.product.update({ where: { name: 'A' }, data: { sellingPrice: 3.3 } });
    await testPrisma.product.upsert({ where: { name: 'C' }, create: { name: 'C', brandId: marca.id, sellingPrice: 4.4 }, update: {} });
    await testPrisma.product.upsert({ where: { name: 'B' }, create: { name: 'B', brandId: marca.id }, update: { sellingPrice: 5.5 } });
    await testPrisma.product.updateMany({ where: { name: 'C' }, data: { promotionalPrice: 0.99 } });

    const linhas = await testPrisma.$queryRaw<Array<{ name: string; sellingPrice: number; promotionalPrice: number | null }>>`SELECT name, "sellingPrice", "promotionalPrice" FROM "Product" ORDER BY name`;
    expect(linhas).toEqual([
      { name: 'A', sellingPrice: 330, promotionalPrice: null },
      { name: 'B', sellingPrice: 550, promotionalPrice: null },
      { name: 'C', sellingPrice: 440, promotionalPrice: 99 },
    ]);
  });
});

describe('consultas por valor e agregações', () => {
  it('filtrar por faixa de preço em reais acha o que está certo', async () => {
    const marca = await criarMarca();
    for (const [name, preco, promo] of [['barato', 9.99, null], ['medio', 50, 40], ['caro', 120.5, 100]] as const) {
      await testPrisma.product.create({ data: { name, brandId: marca.id, sellingPrice: preco, promotionalPrice: promo } });
    }

    const nomes = async (where: object) => (await testPrisma.product.findMany({ where, orderBy: { name: 'asc' } })).map(p => p.name);

    expect(await nomes({ sellingPrice: { gte: 50 } })).toEqual(['caro', 'medio']);
    expect(await nomes({ sellingPrice: { lt: 10 } })).toEqual(['barato']);
    expect(await nomes({ sellingPrice: { in: [9.99, 120.5] } })).toEqual(['barato', 'caro']);
    expect(await nomes({ promotionalPrice: { not: null, gt: 0 } })).toEqual(['caro', 'medio']);
    expect(await nomes({ NOT: { sellingPrice: { gt: 100 } } })).toEqual(['barato', 'medio']);
  });

  it('ordenar pelo preço', async () => {
    const marca = await criarMarca();
    for (const [name, preco] of [['b', 20], ['a', 5.5], ['c', 100]] as const) {
      await testPrisma.product.create({ data: { name, brandId: marca.id, sellingPrice: preco } });
    }

    const ordem = (await testPrisma.product.findMany({ orderBy: { sellingPrice: 'desc' } })).map(p => p.name);
    expect(ordem).toEqual(['c', 'b', 'a']);
  });

  it('a soma de parcelas é exata: 0,10 + 0,20 dá 0,30, não 0,30000000000000004', async () => {
    const venda = await testPrisma.sale.create({ data: { total: 0.3 } });
    await testPrisma.installment.createMany({
      data: [0.1, 0.2].map((value, i) => ({ saleId: venda.id, number: i + 1, value, dueDate: new Date() })),
    });

    expect(0.1 + 0.2).not.toBe(0.3);
    const soma = await testPrisma.installment.aggregate({ _sum: { value: true }, _count: { value: true } });

    expect(soma._sum.value).toBe(0.3);
    expect(soma._count.value).toBe(2);
  });

  it('groupBy e _avg/_min/_max voltam em reais', async () => {
    const cliente = await criarCliente();
    await testPrisma.sale.createMany({ data: [{ total: 10.5, customerId: cliente.id }, { total: 20.25, customerId: cliente.id }, { total: 99.99 }] });

    const agrupado = await testPrisma.sale.groupBy({ by: ['customerId'], _sum: { total: true }, orderBy: { customerId: 'asc' } });
    expect(agrupado).toEqual([{ customerId: cliente.id, _sum: { total: 30.75 } }, { customerId: null, _sum: { total: 99.99 } }]);

    const todos = await testPrisma.sale.aggregate({ _min: { total: true }, _max: { total: true } });
    expect(todos._min.total).toBe(10.5);
    expect(todos._max.total).toBe(99.99);
  });

  it('multiplicar ou dividir um campo monetário é recusado, em vez de gravar o valor errado', async () => {
    const venda = await testPrisma.sale.create({ data: { total: 10 } });

    await expect(testPrisma.sale.update({ where: { id: venda.id }, data: { total: { multiply: 2 } } })).rejects.toThrow(/multiply/);
  });

  it('incrementar um campo monetário soma em reais', async () => {
    const venda = await testPrisma.sale.create({ data: { total: 10 } });

    const depois = await testPrisma.sale.update({ where: { id: venda.id }, data: { total: { increment: 2.5 } } });

    expect(depois.total).toBe(12.5);
  });
});

describe('o SQL escrito à mão: a dívida do cliente', () => {
  it('soma centavos inteiros, e a soma de três parcelas de 33,33 é exatamente 99,99', async () => {
    const cliente = await criarCliente('Ana');
    const venda = await testPrisma.sale.create({ data: { total: 99.99, customerId: cliente.id } });
    await testPrisma.installment.createMany({
      data: [1, 2, 3].map(number => ({ saleId: venda.id, number, value: 33.33, dueDate: new Date(Date.now() + 86400000) })),
    });

    let corpo: Array<{ name: string; totalDebt: number }> = [];
    await getAll({} as never, { json(b: typeof corpo) { corpo = b; return this; } } as never);

    expect(corpo.find(c => c.name === 'Ana')!.totalDebt).toBe(99.99);
  });
});
