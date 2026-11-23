import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { confirm } from '../../src/controllers/orders.controller.js';
import { criarConta, criarPedidoPendente, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * A2 — confirmar o mesmo pedido duas vezes.
 *
 * `confirm` lê o pedido, checa `status !== 'PENDING'`, e só vira `CONFIRMED` no
 * fim da transação. Dois cliques simultâneos — ou um duplo-clique no botão —
 * passam os dois pela checagem: nascem **duas vendas** para um pedido, o estoque
 * baixa duas vezes e o cliente é cobrado em dobro.
 *
 * O controller fala HTTP, então o teste monta `req`/`res` falsos. É mais tosco
 * que `supertest`, mas não exige subir o Express nem autenticar — e o que está
 * sob teste é a transação, não o roteamento.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

type Resposta = { status: number; body: unknown };

/** `res` mínimo: guarda o status e o corpo em vez de escrever num socket. */
function resFalso() {
  const capturado: Resposta = { status: 200, body: null };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
  };
  return { res, capturado };
}

function confirmar(orderId: number, body: Record<string, unknown> = { createCustomer: true }) {
  const { res, capturado } = resFalso();
  const req = { params: { id: String(orderId) }, body } as never;
  return confirm(req, res as never).then(() => capturado);
}

async function pedidoPronto(estoque = 5, quantidade = 1, preco = 100) {
  const produto = await criarProduto({ quantidade: estoque, preco });
  const conta = await criarConta();
  const pedido = await criarPedidoPendente({
    userId: conta.id,
    productId: produto.id,
    quantidade,
    unitPrice: preco,
  });
  return { produto, conta, pedido };
}

describe('confirmar um pedido', () => {
  it('vira venda e marca o pedido como confirmado', async () => {
    const { pedido } = await pedidoPronto();

    const r = await confirmar(pedido.id);

    expect(r.status).toBe(200);
    expect(await testPrisma.sale.count()).toBe(1);

    const depois = await testPrisma.order.findUnique({ where: { id: pedido.id } });
    expect(depois?.status).toBe('CONFIRMED');
    expect(depois?.saleId).not.toBeNull();
  });

  it('baixa o estoque uma vez', async () => {
    const { produto, pedido } = await pedidoPronto(5, 2);

    await confirmar(pedido.id);

    const depois = await testPrisma.product.findUnique({ where: { id: produto.id } });
    expect(depois?.quantity).toBe(3);
  });

  it('cria o cliente a partir dos dados da conta quando pedido', async () => {
    const { conta, pedido } = await pedidoPronto();

    await confirmar(pedido.id, { createCustomer: true });

    const contaDepois = await testPrisma.user.findUnique({ where: { id: conta.id } });
    expect(contaDepois?.customerId).not.toBeNull();
    expect(await testPrisma.customer.count()).toBe(1);
  });

  it('recusa sem escolher cliente nem pedir para criar', async () => {
    const { pedido } = await pedidoPronto();

    const r = await confirmar(pedido.id, {});

    expect(r.status).toBe(400);
    expect(await testPrisma.sale.count()).toBe(0);
  });

  it('um pedido já confirmado não confirma de novo', async () => {
    const { pedido } = await pedidoPronto();

    await confirmar(pedido.id);
    const segunda = await confirmar(pedido.id);

    expect(segunda.status).toBe(409);
    expect(await testPrisma.sale.count()).toBe(1);
  });

  it('pedido inexistente dá 404', async () => {
    expect((await confirmar(99999)).status).toBe(404);
  });

  it('id inválido dá 400', async () => {
    const { res, capturado } = resFalso();
    await confirm({ params: { id: 'abc' }, body: {} } as never, res as never);
    expect(capturado.status).toBe(400);
  });
});

describe('confirmar sob concorrência — A2', () => {
  it('dois cliques simultâneos geram UMA venda, não duas', async () => {
    const { pedido } = await pedidoPronto(10, 1);

    await Promise.allSettled([confirmar(pedido.id), confirmar(pedido.id)]);

    // A verdade está no banco: duas vendas significam cliente cobrado em dobro.
    expect(await testPrisma.sale.count()).toBe(1);
  });

  it('o estoque baixa uma vez só', async () => {
    const { produto, pedido } = await pedidoPronto(10, 3);

    await Promise.allSettled([confirmar(pedido.id), confirmar(pedido.id)]);

    const depois = await testPrisma.product.findUnique({ where: { id: produto.id } });
    expect(depois?.quantity).toBe(7);
  });

  it('cinco confirmações simultâneas: uma venda', async () => {
    const { pedido } = await pedidoPronto(20, 1);

    await Promise.allSettled(Array.from({ length: 5 }, () => confirmar(pedido.id)));

    expect(await testPrisma.sale.count()).toBe(1);

    const depois = await testPrisma.order.findUnique({ where: { id: pedido.id } });
    expect(depois?.status).toBe('CONFIRMED');
  });
});
