import type { Request, Response } from 'express';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { upsert, update } from '../../src/controllers/products.controller.js';
import { criarMarca, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * Os furos do cadastro, pela porta do controller.
 *
 * `productInput.test.ts` cobre a validação como função pura. Aqui o que se
 * verifica é que ela está **ligada** — a validação existia e não estava no
 * caminho é precisamente o tipo de erro que o teste de unidade não pega.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

function resFalso() {
  const capturado = { status: 200, body: null as unknown };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
  };
  return { res: res as unknown as Response, capturado };
}

function enviar(body: Record<string, unknown>) {
  const { res, capturado } = resFalso();
  return upsert({ body } as Request, res).then(() => capturado);
}

async function marcaId() {
  return (await criarMarca()).id;
}

describe('POST /products — o que era aceito e não devia', () => {
  it('quantidade negativa é recusada com 400, não gravada com 201', async () => {
    const r = await enviar({ name: 'Negativo', brandId: await marcaId(), quantity: -5, sellingPrice: 10, averageCost: 5 });

    expect(r.status).toBe(400);
    expect(await testPrisma.product.count()).toBe(0);
  });

  it('nenhum produto no banco pode ter estoque negativo', async () => {
    const brandId = await marcaId();
    await enviar({ name: 'A', brandId, quantity: -1, sellingPrice: 10, averageCost: 5 });
    await enviar({ name: 'B', brandId, quantity: 0, sellingPrice: 10, averageCost: 5 });

    expect(await testPrisma.product.count({ where: { quantity: { lt: 0 } } })).toBe(0);
  });

  it('nome ausente dá 400 com mensagem, não 500 do Prisma', async () => {
    const r = await enviar({ brandId: await marcaId(), quantity: 1, sellingPrice: 10 });

    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toContain('nome');
  });

  it('marca ausente dá 400', async () => {
    const r = await enviar({ name: 'Sem marca', quantity: 1, sellingPrice: 10 });
    expect(r.status).toBe(400);
  });

  it('marca inexistente dá erro tratado, não 500 cru', async () => {
    const r = await enviar({ name: 'Marca fantasma', brandId: 99999, quantity: 1, sellingPrice: 10, averageCost: 1 });
    expect([400, 409]).toContain(r.status);
  });

  it('cadastro válido continua funcionando', async () => {
    const r = await enviar({
      name: 'Café 500g', brandId: await marcaId(), quantity: 10,
      averageCost: 12.5, sellingPrice: 25, expiryDate: '2026-12-31',
    });

    expect(r.status).toBe(201);
    const p = await testPrisma.product.findUnique({ where: { name: 'Café 500g' } });
    expect(p?.quantity).toBe(10);
    expect(p?.expiryDate?.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });
});

describe('POST /products — reabastecer', () => {
  it('soma o estoque', async () => {
    const brandId = await marcaId();
    const p = await criarProduto({ quantidade: 10, preco: 100, brandId, nome: 'Reabastece' });

    await enviar({ name: p.name, brandId, quantity: 5, averageCost: 50, sellingPrice: 100 });

    const depois = await testPrisma.product.findUnique({ where: { id: p.id } });
    expect(depois?.quantity).toBe(15);
  });

  it('reabastecer sem custo NÃO derruba o custo médio', async () => {
    // Era 50 -> virava 25. Lucro inflado no Dashboard na mesma proporção.
    const brandId = await marcaId();
    const p = await testPrisma.product.create({
      data: { name: 'Custo preservado', brandId, quantity: 10, averageCost: 50, sellingPrice: 100 },
    });

    await enviar({ name: p.name, brandId, quantity: 10, sellingPrice: 100 });

    const depois = await testPrisma.product.findUnique({ where: { id: p.id } });
    expect(depois?.averageCost).toBe(50);
  });

  it('reabastecer com custo faz média ponderada', async () => {
    const brandId = await marcaId();
    const p = await testPrisma.product.create({
      data: { name: 'Média', brandId, quantity: 10, averageCost: 10, sellingPrice: 100 },
    });

    await enviar({ name: p.name, brandId, quantity: 10, averageCost: 20, sellingPrice: 100 });

    const depois = await testPrisma.product.findUnique({ where: { id: p.id } });
    expect(depois?.averageCost).toBe(15);
  });

  it('quantidade negativa não reduz estoque pela porta do reabastecimento', async () => {
    const brandId = await marcaId();
    const p = await criarProduto({ quantidade: 3, brandId, nome: 'Não reduz' });

    const r = await enviar({ name: p.name, brandId, quantity: -10, sellingPrice: 100, averageCost: 5 });

    expect(r.status).toBe(400);
    const depois = await testPrisma.product.findUnique({ where: { id: p.id } });
    expect(depois?.quantity).toBe(3);
  });

  it('mantém a validade que vence primeiro', async () => {
    const brandId = await marcaId();
    const p = await testPrisma.product.create({
      data: {
        name: 'Validade', brandId, quantity: 5, averageCost: 10, sellingPrice: 20,
        expiryDate: new Date('2026-09-01T00:00:00Z'),
      },
    });

    await enviar({ name: p.name, brandId, quantity: 5, averageCost: 10, sellingPrice: 20, expiryDate: '2026-04-01' });

    const depois = await testPrisma.product.findUnique({ where: { id: p.id } });
    expect(depois?.expiryDate?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('PUT /products/:id', () => {
  it('recusa quantidade negativa na edição também', async () => {
    const brandId = await marcaId();
    const p = await criarProduto({ quantidade: 5, brandId, nome: 'Edita' });

    const { res, capturado } = resFalso();
    await update({ params: { id: String(p.id) }, body: { name: p.name, brandId, quantity: -1, sellingPrice: 10, averageCost: 5 } } as unknown as Request, res);

    expect(capturado.status).toBe(400);
    const depois = await testPrisma.product.findUnique({ where: { id: p.id } });
    expect(depois?.quantity).toBe(5);
  });

  it('id inválido dá 400, não 500', async () => {
    const { res, capturado } = resFalso();
    await update({ params: { id: 'abc' }, body: {} } as unknown as Request, res);
    expect(capturado.status).toBe(400);
  });

  it('produto inexistente dá 404', async () => {
    const { res, capturado } = resFalso();
    await update({ params: { id: '99999' }, body: { name: 'X', brandId: await marcaId(), quantity: 1, sellingPrice: 1, averageCost: 1 } } as unknown as Request, res);
    expect(capturado.status).toBe(404);
  });
});
