import type { Request, Response } from 'express';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { pay } from '../../src/controllers/installments.controller.js';
import { registerSale } from '../../src/lib/sales.js';
import { criarCliente, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * Registrar pagamento de parcela, duas vezes.
 *
 * O dano hoje é pequeno — paga é paga, o estado final não muda. O que o teste
 * prende é a forma: checar e escrever como operação única, do mesmo jeito que o
 * estoque e a confirmação de pedido. É o terceiro lugar com o mesmo padrão, e o
 * único em que ele ainda não valia.
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

function pagar(id: number) {
  const { res, capturado } = resFalso();
  return pay({ params: { id: String(id) } } as unknown as Request, res).then(() => capturado);
}

async function vendaComParcelas() {
  const produto = await criarProduto({ quantidade: 10, preco: 300 });
  const cliente = await criarCliente();

  return testPrisma.$transaction(tx => registerSale(tx, {
    customerId: cliente.id,
    items: [{ productId: produto.id, quantity: 1 }],
    discount: 0,
    installmentsCount: 3,
    paymentType: 'PRAZO',
    observation: null,
  }));
}

describe('pagar uma parcela', () => {
  it('marca como paga', async () => {
    const venda = await vendaComParcelas();
    const parcela = venda.installments[0]!;

    const r = await pagar(parcela.id);

    expect(r.status).toBe(200);
    const depois = await testPrisma.installment.findUnique({ where: { id: parcela.id } });
    expect(depois?.paidAt).not.toBeNull();
  });

  it('não mexe nas outras parcelas da venda', async () => {
    const venda = await vendaComParcelas();

    await pagar(venda.installments[0]!.id);

    const emAberto = await testPrisma.installment.count({
      where: { saleId: venda.id, paidAt: null },
    });
    expect(emAberto).toBe(2);
  });

  it('pagar de novo é recusado, e a data do primeiro pagamento é preservada', async () => {
    // Importa: se o segundo pagamento sobrescrevesse `paidAt`, a data de
    // quitação mudaria a cada clique.
    const venda = await vendaComParcelas();
    const parcela = venda.installments[0]!;

    await pagar(parcela.id);
    const primeira = await testPrisma.installment.findUnique({ where: { id: parcela.id } });

    const segunda = await pagar(parcela.id);

    expect(segunda.status).toBe(409);
    const depois = await testPrisma.installment.findUnique({ where: { id: parcela.id } });
    expect(depois?.paidAt?.toISOString()).toBe(primeira?.paidAt?.toISOString());
  });

  it('parcela inexistente dá 404', async () => {
    expect((await pagar(99999)).status).toBe(404);
  });

  it('id inválido dá 400, não 500', async () => {
    const { res, capturado } = resFalso();
    await pay({ params: { id: 'abc' } } as unknown as Request, res);
    expect(capturado.status).toBe(400);
  });
});

describe('pagar sob concorrência', () => {
  it('dois cliques simultâneos: uma resposta de sucesso, uma de recusa', async () => {
    const venda = await vendaComParcelas();
    const parcela = venda.installments[0]!;

    const [a, b] = await Promise.all([pagar(parcela.id), pagar(parcela.id)]);
    const status = [a.status, b.status].sort();

    expect(status).toEqual([200, 409]);
  });

  it('cinco cliques simultâneos: exatamente um sucesso', async () => {
    const venda = await vendaComParcelas();
    const parcela = venda.installments[0]!;

    const rs = await Promise.all(Array.from({ length: 5 }, () => pagar(parcela.id)));

    expect(rs.filter(r => r.status === 200)).toHaveLength(1);
    expect(rs.filter(r => r.status === 409)).toHaveLength(4);
  });
});
