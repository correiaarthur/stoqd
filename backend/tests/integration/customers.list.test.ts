import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getAll } from '../../src/controllers/customers.controller.js';
import { getSalesReport } from '../../src/controllers/analytics.controller.js';
import { criarCliente, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * A dívida de cada cliente sai de uma consulta agregada no banco, não de somar
 * em JS todas as vendas carregadas. O que se confere aqui é o resultado.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

const DIA = 24 * 60 * 60 * 1000;

function chamar(handler: (req: never, res: never) => Promise<unknown>, req: Record<string, unknown> = {}) {
  const capturado = { status: 200, body: null as unknown };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
  };
  return handler(req as never, res as never).then(() => capturado);
}

type Parcela = { value: number; vencida?: boolean; paga?: boolean };

async function venda(customerId: number | null, parcelas: Parcela[], productId?: number, discount = 0) {
  return testPrisma.sale.create({
    data: {
      total: parcelas.reduce((acc, p) => acc + p.value, 0),
      discount,
      customerId,
      ...(productId ? { items: { create: { productId, quantity: 1, unitPrice: 100 } } } : {}),
      installments: {
        create: parcelas.map((p, i) => ({
          number: i + 1,
          value: p.value,
          dueDate: new Date(Date.now() + (p.vencida ? -5 : 30) * DIA),
          paidAt: p.paga ? new Date() : null,
        })),
      },
    },
  });
}

type Linha = { id: number; totalDebt: number; pendingSalesCount: number; hasOverdue: boolean };

describe('lista de clientes: dívida agregada', () => {
  it('soma só as parcelas em aberto, conta as vendas em aberto e marca o atraso', async () => {
    const ana = await criarCliente('Ana');
    const beto = await criarCliente('Beto');
    const carla = await criarCliente('Carla');

    // Ana: duas vendas em aberto (uma com parcela vencida) e uma quitada.
    await venda(ana.id, [{ value: 50, paga: true }, { value: 50 }]);
    await venda(ana.id, [{ value: 30, vencida: true }, { value: 20 }]);
    await venda(ana.id, [{ value: 99, paga: true }]);
    // Beto: só dívida a vencer.
    await venda(beto.id, [{ value: 12.5 }]);
    // Carla: nunca comprou.

    const { body } = await chamar(getAll);
    const porNome = new Map((body as Array<Linha & { name: string }>).map(l => [l.name, l]));

    expect(porNome.get('Ana')).toMatchObject({ totalDebt: 100, pendingSalesCount: 2, hasOverdue: true });
    expect(porNome.get('Beto')).toMatchObject({ totalDebt: 12.5, pendingSalesCount: 1, hasOverdue: false });
    expect(porNome.get('Carla')).toMatchObject({ totalDebt: 0, pendingSalesCount: 0, hasOverdue: false });
    expect(porNome.get('Carla')!.id).toBe(carla.id);
  });

  it('parcela vencida mas já paga não marca atraso', async () => {
    const ana = await criarCliente('Ana');
    await venda(ana.id, [{ value: 40, vencida: true, paga: true }, { value: 10 }]);

    const { body } = await chamar(getAll);
    expect((body as Linha[])[0]).toMatchObject({ totalDebt: 10, hasOverdue: false });
  });

  it('venda sem cliente não aparece na dívida de ninguém', async () => {
    const ana = await criarCliente('Ana');
    await venda(null, [{ value: 500 }]);

    const { body } = await chamar(getAll);
    expect((body as Linha[]).find(l => l.id === ana.id)).toMatchObject({ totalDebt: 0 });
  });

  it('mantém a ordem alfabética e a forma da resposta', async () => {
    await criarCliente('Zeca');
    await criarCliente('Ana');

    const { body } = await chamar(getAll);
    const linhas = body as Array<Record<string, unknown>>;

    expect(linhas.map(l => l.name)).toEqual(['Ana', 'Zeca']);
    expect(Object.keys(linhas[0]!).sort()).toEqual(
      ['email', 'hasOverdue', 'id', 'name', 'pendingSalesCount', 'phone', 'totalDebt']
    );
  });
});

describe('relatório de vendas', () => {
  it('exige o período', async () => {
    const r = await chamar(getSalesReport, { query: {} });
    expect(r.status).toBe(400);
  });

  it('recusa data inválida', async () => {
    const r = await chamar(getSalesReport, { query: { from: 'ontem' } });
    expect(r.status).toBe(400);
  });

  it('rateia o desconto da venda entre os itens e respeita o período', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 100, nome: 'Sabonete' });
    const antiga = await venda(null, [{ value: 90, paga: true }], produto.id, 10);
    await testPrisma.sale.update({ where: { id: antiga.id }, data: { date: new Date(Date.now() - 400 * DIA) } });
    const recente = await venda(null, [{ value: 90, paga: true }], produto.id, 10);

    const { body } = await chamar(getSalesReport, { query: { from: new Date(Date.now() - 30 * DIA).toISOString() } });
    const linhas = body as Array<{ saleId: number; revenue: number; productName: string; brandName: string; categoryName: string }>;

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      saleId: recente.id,
      revenue: 90,
      productName: 'Sabonete',
      categoryName: 'Sem Categoria',
    });
  });
});
