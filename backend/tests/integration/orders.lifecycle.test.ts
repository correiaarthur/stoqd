import type { Request, Response } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/notifications.js', () => ({ notifyNewOrder: vi.fn() }));

import { cancel, create, list } from '../../src/controllers/orders.controller.js';
import { notifyNewOrder } from '../../src/lib/notifications.js';
import { criarConta, criarCupom, criarPedidoPendente, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * O ciclo de vida do pedido pelo controller: criar, listar para a loja e recusar.
 * (Confirmar tem o seu arquivo: `orders.confirm.test.ts`.)
 *
 * Escritos antes de a lógica sair do controller para o service, como rede: o que
 * estes testes dizem não pode mudar com a extração.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); vi.mocked(notifyNewOrder).mockClear(); });
afterAll(async () => { await fecharBanco(); });

/**
 * Os planos de parcelamento vêm das migrations e `limparBanco` não os restaura:
 * quem mexe neles devolve ao que eram, senão suja os arquivos seguintes.
 */
let planosOriginais: Array<{ installments: number; interestPercent: number; active: boolean }> = [];
beforeAll(async () => { planosOriginais = await testPrisma.installmentPlan.findMany(); });
afterEach(async () => {
  for (const plano of planosOriginais) {
    await testPrisma.installmentPlan.update({
      where: { installments: plano.installments },
      data: { interestPercent: plano.interestPercent, active: plano.active },
    });
  }
});

const definirPlano = (installments: number, interestPercent: number, active = true) =>
  testPrisma.installmentPlan.update({ where: { installments }, data: { interestPercent, active } });

type Resposta = { status: number; body: any };

function chamar(handler: (req: Request, res: Response) => Promise<unknown>, req: Record<string, unknown>) {
  const capturado: Resposta = { status: 200, body: null };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
  };
  return handler(req as unknown as Request, res as unknown as Response).then(() => capturado);
}

const TOKEN_A = 'carrinho-token-aaaa-0001';
const TOKEN_B = 'carrinho-token-bbbb-0002';
const MINUTO = 60 * 1000;

const criarPedido = (userId: number, body: Record<string, unknown>) =>
  chamar(create, { auth: { role: 'customer', userId }, body });

const reservar = (productId: number, cartToken: string, quantity: number, extra: { userId?: number; orderId?: number } = {}) =>
  testPrisma.reservation.create({
    data: { productId, quantity, cartToken, expiresAt: new Date(Date.now() + 5 * MINUTO), ...extra },
  });

describe('criar o pedido', () => {
  it('nasce PENDING, congela o preço que a pessoa viu e devolve o total — sem baixar estoque', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 100, promocional: 80 });
    const conta = await criarConta();

    const r = await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 2 }], observation: ' retiro sábado ' });

    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: expect.any(Number), status: 'PENDING', total: 160 });

    const pedido = await testPrisma.order.findUniqueOrThrow({ where: { id: r.body.id }, include: { items: true } });
    expect(pedido).toMatchObject({ status: 'PENDING', userId: conta.id, observation: 'retiro sábado', paymentType: 'VISTA', installmentsCount: 1 });
    expect(pedido.items).toEqual([expect.objectContaining({ productId: produto.id, quantity: 2, unitPrice: 80 })]);

    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: produto.id } })).quantity).toBe(10);
  });

  it('as reservas do carrinho passam a pertencer ao pedido, por 30 minutos', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const conta = await criarConta();
    await reservar(produto.id, TOKEN_A, 2);
    const deOutro = await reservar(produto.id, TOKEN_B, 1);

    const r = await criarPedido(conta.id, { cartToken: TOKEN_A, items: [{ productId: produto.id, quantity: 2 }] });

    const dele = await testPrisma.reservation.findFirstOrThrow({ where: { cartToken: TOKEN_A } });
    expect(dele.orderId).toBe(r.body.id);
    expect(dele.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * MINUTO);
    expect(dele.expiresAt.getTime()).toBeLessThan(Date.now() + 31 * MINUTO);

    // A reserva de outro carrinho não é tocada.
    expect((await testPrisma.reservation.findUniqueOrThrow({ where: { id: deOutro.id } })).orderId).toBeNull();
  });

  it('avisa a loja depois de gravar, com o cliente, os itens e o total', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 25, nome: 'Sabonete' });
    const conta = await criarConta();

    const r = await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 2 }] });

    expect(notifyNewOrder).toHaveBeenCalledTimes(1);
    expect(notifyNewOrder).toHaveBeenCalledWith({
      orderId: r.body.id,
      customerName: conta.name,
      customerPhone: conta.phone,
      customerEmail: null,
      total: 50,
      items: [{ name: 'Sabonete', quantity: 2, unitPrice: 25 }],
    });
  });

  it('o aviso não sai quando o pedido é recusado', async () => {
    const produto = await criarProduto({ quantidade: 1, preco: 10 });
    const conta = await criarConta();

    await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 5 }] });

    expect(notifyNewOrder).not.toHaveBeenCalled();
  });

  it('recusa o quarto pedido pendente (429); pedido já confirmado não conta', async () => {
    const produto = await criarProduto({ quantidade: 50, preco: 10 });
    const conta = await criarConta();

    for (let i = 0; i < 3; i++) await criarPedidoPendente({ userId: conta.id, productId: produto.id, quantidade: 1, unitPrice: 10 });

    const bloqueado = await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 1 }] });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toMatch(/pedidos aguardando confirmação/);

    await testPrisma.order.updateMany({ where: { userId: conta.id }, data: { status: 'CONFIRMED' } });
    expect((await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 1 }] })).status).toBe(201);
  });

  it('o limite de pendentes é por pessoa', async () => {
    const produto = await criarProduto({ quantidade: 50, preco: 10 });
    const ana = await criarConta();
    const bia = await criarConta();
    for (let i = 0; i < 3; i++) await criarPedidoPendente({ userId: ana.id, productId: produto.id, quantidade: 1, unitPrice: 10 });

    expect((await criarPedido(bia.id, { items: [{ productId: produto.id, quantity: 1 }] })).status).toBe(201);
  });

  it('o que outra pessoa reservou conta contra o pedido, e diz quanto restou', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10, nome: 'Creme' });
    const conta = await criarConta();
    await reservar(produto.id, TOKEN_B, 4);

    const r = await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 3 }] });

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Restam 1 de 3 unidades de Creme. Ajuste a quantidade para continuar.');
    expect(await testPrisma.order.count()).toBe(0);
  });

  it('a reserva do próprio carrinho não conta contra ele', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const conta = await criarConta();
    await reservar(produto.id, TOKEN_A, 5);

    const r = await criarPedido(conta.id, { cartToken: TOKEN_A, items: [{ productId: produto.id, quantity: 5 }] });

    expect(r.status).toBe(201);
  });

  it('item que esgotou diz que esgotou', async () => {
    const produto = await criarProduto({ quantidade: 2, preco: 10, nome: 'Perfume' });
    const conta = await criarConta();
    await reservar(produto.id, TOKEN_B, 2);

    const r = await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 1 }] });

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Perfume esgotou enquanto você finalizava. Remova o item para continuar.');
  });

  it('produto que não existe mais é recusado', async () => {
    const conta = await criarConta();

    const r = await criarPedido(conta.id, { items: [{ productId: 987654, quantity: 1 }] });

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Um dos produtos do carrinho não existe mais.');
  });

  it('tudo ou nada: um item sem estoque não deixa pedido nem reserva movida', async () => {
    const bom = await criarProduto({ quantidade: 10, preco: 10 });
    const curto = await criarProduto({ quantidade: 1, preco: 10 });
    const conta = await criarConta();
    await reservar(bom.id, TOKEN_A, 2);

    const r = await criarPedido(conta.id, {
      cartToken: TOKEN_A,
      items: [{ productId: bom.id, quantity: 2 }, { productId: curto.id, quantity: 9 }],
    });

    expect(r.status).toBe(400);
    expect(await testPrisma.order.count()).toBe(0);
    expect((await testPrisma.reservation.findFirstOrThrow({ where: { cartToken: TOKEN_A } })).orderId).toBeNull();
  });

  it('parcelamento que a loja desligou é recusado; ligado, grava a preferência', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 100 });
    const conta = await criarConta();
    const corpo = { items: [{ productId: produto.id, quantity: 1 }], paymentType: 'PRAZO', installmentsCount: 6 };

    await definirPlano(6, 8, false);
    const desligado = await criarPedido(conta.id, corpo);
    expect(desligado.status).toBe(400);
    expect(desligado.body.error).toBe('O parcelamento em 6x não está disponível.');

    await definirPlano(6, 8, true);
    const ligado = await criarPedido(conta.id, corpo);
    expect(ligado.status).toBe(201);
    expect(await testPrisma.order.findUniqueOrThrow({ where: { id: ligado.body.id } }))
      .toMatchObject({ paymentType: 'PRAZO', installmentsCount: 6 });
  });

  it('cupom inválido recusa o pedido; válido fica ligado a ele, sem gastar o uso', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 100 });
    const conta = await criarConta();
    const cupom = await criarCupom({ codigo: 'CICLO10', valor: 10, maxUsos: 5 });

    const invalido = await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 1 }], couponCode: 'NAOEXISTE' });
    expect(invalido.status).toBe(400);
    expect(invalido.body.error).toBe('Cupom não encontrado.');

    const ok = await criarPedido(conta.id, { items: [{ productId: produto.id, quantity: 1 }], couponCode: 'ciclo10' });
    expect(ok.status).toBe(201);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: ok.body.id } })).couponId).toBe(cupom.id);
    // Quem gasta o uso é a venda, na confirmação.
    expect((await testPrisma.coupon.findUniqueOrThrow({ where: { id: cupom.id } })).usedCount).toBe(0);
  });
});

describe('recusar o pedido', () => {
  const recusar = (id: unknown, body: Record<string, unknown> = { reason: 'Sem estoque' }) =>
    chamar(cancel, { params: { id: String(id) }, body });

  it('vira CANCELLED com o motivo, solta as reservas dele e devolve o resumo', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const conta = await criarConta();
    const pedido = await criarPedidoPendente({ userId: conta.id, productId: produto.id, quantidade: 2, unitPrice: 10 });
    const outro = await criarPedidoPendente({ userId: conta.id, productId: produto.id, quantidade: 1, unitPrice: 10 });
    await reservar(produto.id, TOKEN_A, 2, { orderId: pedido.id });
    await reservar(produto.id, TOKEN_B, 1, { orderId: outro.id });

    const r = await recusar(pedido.id, { reason: '  Produto saiu de linha  ' });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: pedido.id, status: 'CANCELLED', cancelReason: 'Produto saiu de linha' });

    expect(await testPrisma.reservation.count({ where: { orderId: pedido.id } })).toBe(0);
    expect(await testPrisma.reservation.count({ where: { orderId: outro.id } })).toBe(1);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: outro.id } })).status).toBe('PENDING');
  });

  it('o motivo é cortado em 300 caracteres', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const conta = await criarConta();
    const pedido = await criarPedidoPendente({ userId: conta.id, productId: produto.id, quantidade: 1, unitPrice: 10 });

    const r = await recusar(pedido.id, { reason: 'x'.repeat(500) });

    expect(r.body.cancelReason).toHaveLength(300);
  });

  it('só recusa pedido pendente: confirmado ou já recusado dá 409', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const conta = await criarConta();

    for (const status of ['CONFIRMED', 'CANCELLED'] as const) {
      const pedido = await criarPedidoPendente({ userId: conta.id, productId: produto.id, quantidade: 1, unitPrice: 10 });
      await testPrisma.order.update({ where: { id: pedido.id }, data: { status } });

      const r = await recusar(pedido.id);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('Só um pedido pendente pode ser recusado.');
    }
  });

  it('pedido que não existe é 404; id inválido é 400; motivo curto é 400 e não mexe em nada', async () => {
    expect((await recusar(999999)).status).toBe(404);
    expect((await recusar('abc')).status).toBe(400);

    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const conta = await criarConta();
    const pedido = await criarPedidoPendente({ userId: conta.id, productId: produto.id, quantidade: 1, unitPrice: 10 });

    const curto = await recusar(pedido.id, { reason: 'ab' });
    expect(curto.status).toBe(400);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe('PENDING');
  });
});

describe('listar os pedidos para a loja', () => {
  const listar = (query: Record<string, unknown> = {}) => chamar(list, { query });

  async function pedidoCom(userId: number, itens: Array<{ productId: number; quantity: number; unitPrice: number }>, extra: Record<string, unknown> = {}) {
    return testPrisma.order.create({
      data: { userId, items: { create: itens }, ...extra },
    });
  }

  it('sem filtro traz os pendentes, do mais novo para o mais antigo; ALL traz todos', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const conta = await criarConta();
    const velho = await pedidoCom(conta.id, [{ productId: produto.id, quantity: 1, unitPrice: 10 }]);
    const novo = await pedidoCom(conta.id, [{ productId: produto.id, quantity: 1, unitPrice: 10 }]);
    await pedidoCom(conta.id, [{ productId: produto.id, quantity: 1, unitPrice: 10 }], { status: 'CONFIRMED' });
    await testPrisma.order.update({ where: { id: velho.id }, data: { createdAt: new Date(Date.now() - 60 * MINUTO) } });

    const pendentes = await listar();
    expect(pendentes.body.map((o: { id: number }) => o.id)).toEqual([novo.id, velho.id]);

    expect((await listar({ status: 'all' })).body).toHaveLength(3);
    expect((await listar({ status: 'CONFIRMED' })).body).toHaveLength(1);
  });

  it('cada item traz o preço do pedido e o de hoje, e avisa quando mudaram', async () => {
    const mudou = await criarProduto({ quantidade: 10, preco: 120 });
    const igual = await criarProduto({ quantidade: 10, preco: 50 });
    const conta = await criarConta();
    await pedidoCom(conta.id, [
      { productId: mudou.id, quantity: 1, unitPrice: 100 },
      { productId: igual.id, quantity: 1, unitPrice: 50.004 },
    ]);

    const [pedido] = (await listar()).body;
    const porId = new Map(pedido.items.map((i: any) => [i.productId, i]));

    expect(porId.get(mudou.id)).toMatchObject({ unitPrice: 100, currentPrice: 120, priceChanged: true });
    // Diferença menor que meio centavo não é mudança de preço.
    expect(porId.get(igual.id)).toMatchObject({ unitPrice: 50.004, currentPrice: 50, priceChanged: false });
  });

  it('estoque: o disponível desconta reservas de outros; o físico decide se há para todos', async () => {
    const produto = await criarProduto({ quantidade: 3, preco: 10 });
    const conta = await criarConta();
    await pedidoCom(conta.id, [{ productId: produto.id, quantity: 2, unitPrice: 10 }]);
    await reservar(produto.id, TOKEN_B, 2);

    const [pedido] = (await listar()).body;

    expect(pedido.items[0]).toMatchObject({ quantityInStock: 3, available: 1, hasStock: true });
    expect(pedido.hasStockForAll).toBe(true);
  });

  it('sem estoque físico para a quantidade pedida, avisa por item e no pedido', async () => {
    const produto = await criarProduto({ quantidade: 1, preco: 10 });
    const conta = await criarConta();
    await pedidoCom(conta.id, [{ productId: produto.id, quantity: 2, unitPrice: 10 }]);

    const [pedido] = (await listar()).body;

    expect(pedido.items[0].hasStock).toBe(false);
    expect(pedido.hasStockForAll).toBe(false);
  });

  it('o pedido já vem com as contas do que o cliente pediu: cupom, juros e parcela', async () => {
    await definirPlano(4, 5, true);
    const produto = await criarProduto({ quantidade: 10, preco: 100 });
    const conta = await criarConta();
    const cupom = await criarCupom({ codigo: 'DEZ', tipo: 'PERCENT', valor: 10 });
    await pedidoCom(conta.id, [{ productId: produto.id, quantity: 2, unitPrice: 100 }], {
      paymentType: 'PRAZO', installmentsCount: 4, couponId: cupom.id,
    });

    const [pedido] = (await listar()).body;

    expect(pedido.total).toBe(200);
    expect(pedido.requested).toEqual({
      paymentType: 'PRAZO',
      installmentsCount: 4,
      interestPercent: 5,
      coupon: { id: cupom.id, code: 'DEZ', discount: 20 },
      subtotal: 200,
      discount: 20,
      interest: 9,          // 5% sobre os 180 já com desconto
      total: 189,
      installmentValue: 47.25,
    });
  });

  it('à vista: sem juros, e a "parcela" é o total', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 50 });
    const conta = await criarConta();
    await pedidoCom(conta.id, [{ productId: produto.id, quantity: 2, unitPrice: 50 }]);

    const [pedido] = (await listar()).body;

    expect(pedido.requested).toMatchObject({
      paymentType: 'VISTA', interestPercent: 0, interest: 0, coupon: null, total: 100, installmentValue: 100,
    });
  });

  it('parcelamento que a loja desligou depois do pedido vira `interestPercent: null`, sem juros inventados', async () => {
    await definirPlano(6, 8, false);
    const produto = await criarProduto({ quantidade: 10, preco: 100 });
    const conta = await criarConta();
    await pedidoCom(conta.id, [{ productId: produto.id, quantity: 1, unitPrice: 100 }], { paymentType: 'PRAZO', installmentsCount: 6 });

    const [pedido] = (await listar()).body;

    expect(pedido.requested.interestPercent).toBeNull();
    expect(pedido.requested.interest).toBe(0);
  });

  it('sugere o cliente de balcão com o mesmo telefone ou e-mail — e só com o contato igual', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const linhas = [{ productId: produto.id, quantity: 1, unitPrice: 10 }];

    const porTelefone = await criarConta();
    const clienteTel = await testPrisma.customer.create({ data: { name: 'Mesmo telefone', phone: porTelefone.phone } });

    const porEmail = await testPrisma.user.create({ data: { name: 'Com e-mail', phone: '11977770001', email: 'a@x.com', passwordHash: 'x' } });
    const clienteEmail = await testPrisma.customer.create({ data: { name: 'Mesmo e-mail', phone: null, email: 'a@x.com' } });

    const semEmail = await testPrisma.user.create({ data: { name: 'Sem e-mail', phone: '11977770002', passwordHash: 'x' } });
    await testPrisma.customer.create({ data: { name: 'Outro sem e-mail', phone: '11900000000', email: null } });

    await pedidoCom(porTelefone.id, linhas);
    await pedidoCom(porEmail.id, linhas);
    await pedidoCom(semEmail.id, linhas);

    const pedidos = (await listar()).body as Array<{ user: { id: number }; suggestedCustomers: Array<{ id: number }> }>;
    const sugeridos = (userId: number) => pedidos.find(p => p.user.id === userId)!.suggestedCustomers.map(c => c.id);

    expect(sugeridos(porTelefone.id)).toEqual([clienteTel.id]);
    expect(sugeridos(porEmail.id)).toEqual([clienteEmail.id]);
    // Dois e-mails nulos não são a mesma pessoa.
    expect(sugeridos(semEmail.id)).toEqual([]);
  });

  it('conta já ligada a um cliente não recebe sugestão, e o cliente vem junto', async () => {
    const produto = await criarProduto({ quantidade: 10, preco: 10 });
    const cliente = await testPrisma.customer.create({ data: { name: 'Já ligada', phone: '11966660000' } });
    const conta = await testPrisma.user.create({ data: { name: 'Conta', phone: '11966660000', passwordHash: 'x', customerId: cliente.id } });
    await testPrisma.customer.create({ data: { name: 'Homônimo', phone: '11966660000' } });
    await pedidoCom(conta.id, [{ productId: produto.id, quantity: 1, unitPrice: 10 }]);

    const [pedido] = (await listar()).body;

    expect(pedido.suggestedCustomers).toEqual([]);
    expect(pedido.user.customer).toEqual({ id: cliente.id, name: 'Já ligada' });
  });

  it('situação desconhecida é 400', async () => {
    const r = await listar({ status: 'DONE' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Situação inválida.');
  });

  it('sem pedidos devolve lista vazia', async () => {
    expect((await listar()).body).toEqual([]);
  });
});
