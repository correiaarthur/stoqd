import type { Request, Response } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { confirm } from '../../src/controllers/orders.controller.js';
import { criarCliente, criarConta, criarCupom, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * As regras da confirmação, uma a uma: de quem é a venda, a que preço, com que
 * cupom, e o que acontece quando algo falha no meio.
 *
 * O que sempre vale: se a confirmação falha, **nada** muda — o pedido continua
 * pendente, o estoque não baixa e as reservas ficam. A transação inteira reverte.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

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

type Resposta = { status: number; body: any };

function confirmar(orderId: number, body: Record<string, unknown> = { createCustomer: true }) {
  const capturado: Resposta = { status: 200, body: null };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(corpo: unknown) { capturado.body = corpo; return res; },
  };
  return confirm({ params: { id: String(orderId) }, body } as unknown as Request, res as unknown as Response).then(() => capturado);
}

/** Um pedido pendente com um item; `extra` troca pagamento, cupom, etc. */
async function pedido(opcoes: { userId: number; productId: number; quantidade?: number; unitPrice?: number; extra?: Record<string, unknown> }) {
  return testPrisma.order.create({
    data: {
      userId: opcoes.userId,
      items: { create: { productId: opcoes.productId, quantity: opcoes.quantidade ?? 1, unitPrice: opcoes.unitPrice ?? 100 } },
      ...opcoes.extra,
    },
  });
}

const pendente = async (id: number) => (await testPrisma.order.findUniqueOrThrow({ where: { id } })).status === 'PENDING';

async function cenario(over: { quantidade?: number; estoque?: number; preco?: number } = {}) {
  const produto = await criarProduto({ quantidade: over.estoque ?? 10, preco: over.preco ?? 100 });
  const conta = await criarConta();
  return { produto, conta };
}

describe('de quem é a venda', () => {
  it('liga a conta ao cliente escolhido e a venda fica no nome dele', async () => {
    const { produto, conta } = await cenario();
    const cliente = await criarCliente('Ana Ribeiro');
    const ped = await pedido({ userId: conta.id, productId: produto.id });

    const r = await confirmar(ped.id, { customerId: cliente.id });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ orderId: ped.id, customerId: cliente.id });
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } })).customerId).toBe(cliente.id);
    expect((await testPrisma.sale.findUniqueOrThrow({ where: { id: r.body.saleId } })).customerId).toBe(cliente.id);
  });

  it('criar o cliente a partir da conta também liga os dois', async () => {
    const { produto, conta } = await cenario();
    const ped = await pedido({ userId: conta.id, productId: produto.id });

    const r = await confirmar(ped.id, { createCustomer: true });

    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id }, include: { customer: true } });
    expect(user.customerId).toBe(r.body.customerId);
    expect(user.customer).toMatchObject({ name: conta.name, phone: conta.phone });
  });

  it('cliente escolhido que não existe é 404, e o pedido continua pendente', async () => {
    const { produto, conta } = await cenario();
    const ped = await pedido({ userId: conta.id, productId: produto.id });

    const r = await confirmar(ped.id, { customerId: 987654 });

    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Cliente escolhido não existe.');
    expect(await pendente(ped.id)).toBe(true);
  });

  it('cliente que já pertence a outra conta é 409', async () => {
    const { produto, conta } = await cenario();
    const cliente = await criarCliente();
    await criarConta({ customerId: cliente.id });
    const ped = await pedido({ userId: conta.id, productId: produto.id });

    const r = await confirmar(ped.id, { customerId: cliente.id });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Este cliente já está vinculado a outra conta.');
    expect(await pendente(ped.id)).toBe(true);
  });

  it('conta que já tem cliente o mantém, mesmo que a loja mande outro', async () => {
    const { produto } = await cenario();
    const dono = await criarCliente('Dono');
    const outro = await criarCliente('Outro');
    const conta = await criarConta({ customerId: dono.id });
    const ped = await pedido({ userId: conta.id, productId: produto.id });

    const r = await confirmar(ped.id, { customerId: outro.id });

    expect(r.status).toBe(200);
    expect(r.body.customerId).toBe(dono.id);
    // Nem precisava escolher: conta ligada não exige cliente no corpo.
    const ped2 = await pedido({ userId: conta.id, productId: produto.id });
    expect((await confirmar(ped2.id, {})).body.customerId).toBe(dono.id);
  });
});

describe('a que preço', () => {
  it('pelo preço do pedido, ou pelo de hoje quando a loja escolhe', async () => {
    const { produto, conta } = await cenario({ preco: 100 });
    const a = await pedido({ userId: conta.id, productId: produto.id, unitPrice: 100 });
    const b = await pedido({ userId: conta.id, productId: produto.id, unitPrice: 100 });
    await testPrisma.product.update({ where: { id: produto.id }, data: { sellingPrice: 150 } });

    const pelaPedido = await confirmar(a.id, { createCustomer: true, priceSource: 'order' });
    const peloHoje = await confirmar(b.id, { priceSource: 'current' });

    expect(pelaPedido.body.total).toBe(100);
    expect(peloHoje.body.total).toBe(150);
  });

  it('o desconto da loja abate do total; negativo é recusado e nada muda', async () => {
    const { produto, conta } = await cenario();
    const a = await pedido({ userId: conta.id, productId: produto.id });
    const b = await pedido({ userId: conta.id, productId: produto.id });

    expect((await confirmar(a.id, { createCustomer: true, discount: 10 })).body.total).toBe(90);

    const negativo = await confirmar(b.id, { discount: -10 });
    expect(negativo.status).toBe(400);
    expect(negativo.body.error).toBe('O desconto não pode ser negativo.');
    expect(await pendente(b.id)).toBe(true);
  });
});

describe('o cupom', () => {
  it('é revalidado e gasto na confirmação, com o desconto sobre o subtotal cobrado', async () => {
    const { produto, conta } = await cenario();
    const cupom = await criarCupom({ valor: 10, maxUsos: 5 });
    const ped = await pedido({ userId: conta.id, productId: produto.id, extra: { couponId: cupom.id } });

    const r = await confirmar(ped.id, { createCustomer: true });

    expect(r.body.total).toBe(90);
    expect((await testPrisma.coupon.findUniqueOrThrow({ where: { id: cupom.id } })).usedCount).toBe(1);
    expect((await testPrisma.sale.findUniqueOrThrow({ where: { id: r.body.saleId } })).couponId).toBe(cupom.id);
  });

  it('cupom que venceu entre o pedido e a confirmação recusa tudo e diz o motivo', async () => {
    const { produto, conta } = await cenario();
    const cupom = await criarCupom({ codigo: 'VENCEU', valor: 10 });
    const ped = await pedido({ userId: conta.id, productId: produto.id, extra: { couponId: cupom.id } });
    await testPrisma.coupon.update({ where: { id: cupom.id }, data: { active: false } });

    const r = await confirmar(ped.id, { createCustomer: true });

    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/^O cupom VENCEU não vale mais: .* Confirme sem o cupom ou recuse o pedido\.$/);
    expect(await pendente(ped.id)).toBe(true);
    expect(await testPrisma.sale.count()).toBe(0);
    // O cliente que ia ser criado também não ficou para trás.
    expect(await testPrisma.customer.count()).toBe(0);
  });

  it('`keepCoupon: false` descarta o cupom e não gasta o uso', async () => {
    const { produto, conta } = await cenario();
    const cupom = await criarCupom({ valor: 10 });
    const ped = await pedido({ userId: conta.id, productId: produto.id, extra: { couponId: cupom.id } });

    const r = await confirmar(ped.id, { createCustomer: true, keepCoupon: false });

    expect(r.body.total).toBe(100);
    expect((await testPrisma.coupon.findUniqueOrThrow({ where: { id: cupom.id } })).usedCount).toBe(0);
  });
});

describe('o balcão ganha do pedido (D2)', () => {
  it('se o estoque físico acabou no intervalo, recusa — e o pedido, as reservas e o estoque ficam como estavam', async () => {
    const { produto, conta } = await cenario({ estoque: 1 });
    const ped = await pedido({ userId: conta.id, productId: produto.id, quantidade: 2 });
    await testPrisma.reservation.create({
      data: { productId: produto.id, quantity: 2, cartToken: 'carrinho-token-aaaa-0001', orderId: ped.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    const r = await confirmar(ped.id, { createCustomer: true });

    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Estoque insuficiente para .*\. Restam 1\./);
    expect(await pendente(ped.id)).toBe(true);
    expect(await testPrisma.reservation.count({ where: { orderId: ped.id } })).toBe(1);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: produto.id } })).quantity).toBe(1);
    expect(await testPrisma.customer.count()).toBe(0);
  });
});

describe('o pagamento', () => {
  it('sem troca, vale o que o cliente pediu: a prazo gera as parcelas pedidas, em aberto', async () => {
    const { produto, conta } = await cenario();
    const ped = await pedido({ userId: conta.id, productId: produto.id, extra: { paymentType: 'PRAZO', installmentsCount: 3 } });

    const r = await confirmar(ped.id, { createCustomer: true });

    const parcelas = await testPrisma.installment.findMany({ where: { saleId: r.body.saleId }, orderBy: { number: 'asc' } });
    expect(parcelas).toHaveLength(3);
    expect(parcelas.every(p => p.paidAt === null)).toBe(true);
  });

  it('a loja pode trocar para à vista: uma parcela só, já paga', async () => {
    const { produto, conta } = await cenario();
    const ped = await pedido({ userId: conta.id, productId: produto.id, extra: { paymentType: 'PRAZO', installmentsCount: 3 } });

    const r = await confirmar(ped.id, { createCustomer: true, paymentType: 'VISTA' });

    const parcelas = await testPrisma.installment.findMany({ where: { saleId: r.body.saleId } });
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0]!.paidAt).not.toBeNull();
  });

  it('a loja pode trocar o número de parcelas', async () => {
    const { produto, conta } = await cenario();
    const ped = await pedido({ userId: conta.id, productId: produto.id, extra: { paymentType: 'PRAZO', installmentsCount: 3 } });

    const r = await confirmar(ped.id, { createCustomer: true, installmentsCount: 2 });

    expect(await testPrisma.installment.count({ where: { saleId: r.body.saleId } })).toBe(2);
  });
});

describe('depois de confirmar', () => {
  it('o pedido fica amarrado à venda, e só as reservas dele são soltas', async () => {
    const { produto, conta } = await cenario();
    const ped = await pedido({ userId: conta.id, productId: produto.id });
    const outro = await pedido({ userId: conta.id, productId: produto.id });
    const reserva = (orderId: number, cartToken: string) =>
      testPrisma.reservation.create({ data: { productId: produto.id, quantity: 1, cartToken, orderId, expiresAt: new Date(Date.now() + 60_000) } });
    await reserva(ped.id, 'carrinho-token-aaaa-0001');
    await reserva(outro.id, 'carrinho-token-bbbb-0002');

    const r = await confirmar(ped.id, { createCustomer: true });

    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: ped.id } }))).toMatchObject({ status: 'CONFIRMED', saleId: r.body.saleId });
    expect(await testPrisma.reservation.count({ where: { orderId: ped.id } })).toBe(0);
    expect(await testPrisma.reservation.count({ where: { orderId: outro.id } })).toBe(1);
  });

  it('a observação padrão diz de onde veio a venda; a da loja a substitui', async () => {
    const { produto, conta } = await cenario();
    const a = await pedido({ userId: conta.id, productId: produto.id });
    const b = await pedido({ userId: conta.id, productId: produto.id });

    const padrao = await confirmar(a.id, { createCustomer: true });
    const propria = await confirmar(b.id, { observation: '  entregar sexta  ' });

    expect((await testPrisma.sale.findUniqueOrThrow({ where: { id: padrao.body.saleId } })).observation).toBe(`Pedido #${a.id} pela vitrine`);
    expect((await testPrisma.sale.findUniqueOrThrow({ where: { id: propria.body.saleId } })).observation).toBe('entregar sexta');
  });

  it('pedido recusado não confirma, e a mensagem diz que foi recusado', async () => {
    const { produto, conta } = await cenario();
    const ped = await pedido({ userId: conta.id, productId: produto.id, extra: { status: 'CANCELLED' } });

    const r = await confirmar(ped.id, { createCustomer: true });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Este pedido foi recusado e não pode ser confirmado.');
  });
});
