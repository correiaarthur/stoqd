import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { changePassword, orders, remove, show, update } from '../../src/controllers/me.controller.js';
import { criarCliente, criarConta, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * A conta do cliente pelo controller: ver, editar, trocar a senha, apagar e o
 * histórico de compras.
 *
 * Escritos antes de a lógica sair do controller para o service, como rede: o que
 * estes testes dizem não pode mudar com a extração.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

type Resposta = { status: number; body: any };

function chamar(handler: (req: Request, res: Response) => Promise<unknown>, req: Record<string, unknown>) {
  const capturado: Resposta = { status: 200, body: null };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
    send() { return res; },
  };
  return handler(req as unknown as Request, res as unknown as Response).then(() => capturado);
}

const como = (userId: number, extra: Record<string, unknown> = {}) => ({ auth: { role: 'customer', userId }, ...extra });

describe('ver a conta', () => {
  it('devolve só os campos públicos: nunca o hash da senha nem a versão da sessão', async () => {
    const conta = await criarConta();

    const r = await chamar(show, como(conta.id));

    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['createdAt', 'customerId', 'email', 'id', 'name', 'phone']);
    expect(r.body).toMatchObject({ id: conta.id, name: conta.name, phone: conta.phone, email: null, customerId: null });
  });

  it('conta que não existe é 404', async () => {
    const r = await chamar(show, como(987654));
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Conta não encontrada.');
  });
});

describe('editar a conta', () => {
  const editar = (userId: number, body: Record<string, unknown>) => chamar(update, como(userId, { body }));

  it('grava os campos já normalizados e devolve os públicos', async () => {
    const conta = await criarConta();

    const r = await editar(conta.id, { name: '  Marina   Souza ', phone: '(87) 99641-5746', email: ' MARINA@LOJA.COM ' });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: conta.id, name: 'Marina Souza', phone: '87996415746', email: 'marina@loja.com' });
    expect(r.body).not.toHaveProperty('passwordHash');

    const salvo = await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } });
    expect(salvo).toMatchObject({ name: 'Marina Souza', phone: '87996415746', email: 'marina@loja.com' });
  });

  it('e-mail em branco apaga o e-mail', async () => {
    const conta = await testPrisma.user.create({ data: { name: 'A B', phone: '11999990001', email: 'a@x.com', passwordHash: 'x' } });

    await editar(conta.id, { name: 'A B', phone: conta.phone, email: '' });

    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } })).email).toBeNull();
  });

  it('não deixa escolher campos de fora: papel, vínculo e senha ficam como estavam', async () => {
    const conta = await criarConta();
    const cliente = await criarCliente();

    await editar(conta.id, { name: 'Novo Nome', phone: conta.phone, role: 'admin', customerId: cliente.id, passwordHash: 'x', tokenVersion: 9 });

    const salvo = await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } });
    expect(salvo).toMatchObject({ role: 'customer', customerId: null, tokenVersion: 0 });
    expect(salvo.passwordHash).toBe('hash-de-teste');
  });

  it('telefone de outra conta é 409, dizendo que é o telefone', async () => {
    const dona = await criarConta();
    const outra = await criarConta();

    const r = await editar(outra.id, { name: 'Outra Pessoa', phone: dona.phone });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Já existe uma conta com este telefone.');
  });

  // Com o adapter `pg` o Prisma não informa `meta.target`; ler só ele fazia o e-mail
  // duplicado ser reportado como telefone. Ver `duplicatedFieldsOf`.
  it('e-mail de outra conta é 409, dizendo que é o e-mail', async () => {
    await testPrisma.user.create({ data: { name: 'Dona', phone: '11999990002', email: 'dona@x.com', passwordHash: 'x' } });
    const outra = await criarConta();

    const r = await editar(outra.id, { name: 'Outra Pessoa', phone: outra.phone, email: 'dona@x.com' });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Este e-mail já está em uso.');
  });

  describe('com o e-mail do admin', () => {
    const original = process.env.ADMIN_EMAIL;
    beforeEach(() => { process.env.ADMIN_EMAIL = 'admin@loja.test'; });
    afterEach(() => { if (original === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = original; });

    it('é 409, para não criar uma conta que responde pelo mesmo endereço do admin no login', async () => {
      const conta = await criarConta();

      const r = await editar(conta.id, { name: 'Maria Lima', phone: conta.phone, email: 'ADMIN@loja.test' });

      expect(r.status).toBe(409);
      expect(r.body.error).toBe('Este e-mail já está em uso.');
      expect((await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } })).email).toBeNull();
    });
  });

  it('dado inválido é 400 e não grava nada', async () => {
    const conta = await criarConta();

    const r = await editar(conta.id, { name: 'M', phone: conta.phone });

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Informe seu nome.');
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } })).name).toBe(conta.name);
  });

  it('conta que não existe é 404', async () => {
    const r = await editar(987654, { name: 'Maria Lima', phone: '11988887777' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Conta não encontrada.');
  });
});

describe('trocar a senha', () => {
  const SENHA = 'senha-forte-123';

  async function contaComSenha() {
    return testPrisma.user.create({ data: { name: 'Dayana Leite', phone: '87996415746', passwordHash: await bcrypt.hash(SENHA, 4) } });
  }

  const trocar = (userId: number, body: Record<string, unknown>) => chamar(changePassword, como(userId, { body }));

  it('grava o hash novo, sobe a versão da sessão e devolve um token da versão nova', async () => {
    const conta = await contaComSenha();

    const r = await trocar(conta.id, { currentPassword: SENHA, newPassword: 'outra-senha-456' });

    expect(r.status).toBe(200);
    expect(jwt.decode(r.body.token)).toMatchObject({ role: 'customer', userId: conta.id, tv: 1 });

    const salvo = await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } });
    expect(salvo.tokenVersion).toBe(1);
    expect(await bcrypt.compare('outra-senha-456', salvo.passwordHash)).toBe(true);
    expect(await bcrypt.compare(SENHA, salvo.passwordHash)).toBe(false);
  });

  it('com a senha atual errada é 400 e nada muda', async () => {
    const conta = await contaComSenha();

    const r = await trocar(conta.id, { currentPassword: 'errada-errada', newPassword: 'outra-senha-456' });

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('A senha atual não confere.');

    const salvo = await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } });
    expect(salvo).toMatchObject({ tokenVersion: 0, passwordHash: conta.passwordHash });
  });

  it('a nova senha fraca é 400, antes de olhar a atual', async () => {
    const conta = await contaComSenha();

    const r = await trocar(conta.id, { currentPassword: SENHA, newPassword: 'curta' });

    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/pelo menos 8/);
  });

  it('conta que não existe é 404', async () => {
    const r = await trocar(987654, { currentPassword: SENHA, newPassword: 'outra-senha-456' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Conta não encontrada.');
  });
});

describe('apagar a conta', () => {
  it('apaga só a conta: o cliente de balcão e as vendas ficam; pedidos e reservas saem junto', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const cliente = await criarCliente('Ana');
    const conta = await criarConta({ customerId: cliente.id });
    const venda = await testPrisma.sale.create({ data: { total: 10, customerId: cliente.id } });
    const pedido = await testPrisma.order.create({
      data: { userId: conta.id, items: { create: { productId: produto.id, quantity: 1, unitPrice: 10 } } },
    });
    await testPrisma.reservation.create({
      data: { productId: produto.id, quantity: 1, cartToken: 'carrinho-token-aaaa-0001', userId: conta.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    const r = await chamar(remove, como(conta.id));

    expect(r.status).toBe(204);
    expect(await testPrisma.user.findUnique({ where: { id: conta.id } })).toBeNull();
    expect(await testPrisma.customer.findUnique({ where: { id: cliente.id } })).not.toBeNull();
    expect(await testPrisma.sale.findUnique({ where: { id: venda.id } })).not.toBeNull();
    expect(await testPrisma.order.findUnique({ where: { id: pedido.id } })).toBeNull();
    expect(await testPrisma.reservation.count({ where: { userId: conta.id } })).toBe(0);
  });

  it('a venda que nasceu de um pedido continua depois de a conta sair', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const conta = await criarConta();
    const venda = await testPrisma.sale.create({ data: { total: 10 } });
    await testPrisma.order.create({
      data: { userId: conta.id, status: 'CONFIRMED', saleId: venda.id, items: { create: { productId: produto.id, quantity: 1, unitPrice: 10 } } },
    });

    await chamar(remove, como(conta.id));

    expect(await testPrisma.sale.findUnique({ where: { id: venda.id } })).not.toBeNull();
  });

  it('conta que não existe é 404', async () => {
    const r = await chamar(remove, como(987654));
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Conta não encontrada.');
  });
});

describe('histórico de compras', () => {
  const historico = (userId: number) => chamar(orders, como(userId));

  const MINUTO = 60 * 1000;

  it('conta que não existe é 404', async () => {
    const r = await historico(987654);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Conta não encontrada.');
  });

  it('sem pedidos nem vínculo: lista vazia, e `linkedToCustomer` falso', async () => {
    const conta = await criarConta();

    expect((await historico(conta.id)).body).toEqual({ linkedToCustomer: false, orders: [] });
  });

  it('pedido pendente: o total é o dos itens ao preço do pedido, sem venda nem parcelas', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 100, nome: 'Sabonete' });
    const conta = await criarConta();
    const pedido = await testPrisma.order.create({
      data: { userId: conta.id, items: { create: { productId: produto.id, quantity: 3, unitPrice: 25 } } },
    });

    const { body } = await historico(conta.id);

    expect(body.linkedToCustomer).toBe(false);
    expect(body.orders).toEqual([{
      source: 'ORDER', id: pedido.id, status: 'PENDING', createdAt: pedido.createdAt,
      cancelReason: null, saleId: null,
      total: 75, discount: 0, interest: 0, couponCode: null,
      items: [{ name: 'Sabonete', quantity: 3, unitPrice: 25 }],
      installments: [], pendingAmount: 0, isPaid: false,
    }]);
  });

  it('pedido recusado traz o motivo que o cliente lê', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const conta = await criarConta();
    await testPrisma.order.create({
      data: { userId: conta.id, status: 'CANCELLED', cancelReason: 'Sem estoque', items: { create: { productId: produto.id, quantity: 1, unitPrice: 10 } } },
    });

    const [entrada] = (await historico(conta.id)).body.orders;

    expect(entrada).toMatchObject({ status: 'CANCELLED', cancelReason: 'Sem estoque' });
  });

  it('pedido confirmado: o total, o desconto, os juros e o cupom são os da VENDA, não os do pedido', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 100 });
    const conta = await criarConta();
    const cupom = await testPrisma.coupon.create({ data: { code: 'CICLO10', type: 'PERCENT', value: 10 } });
    const venda = await testPrisma.sale.create({
      data: {
        total: 189, discount: 20, interest: 9, couponId: cupom.id,
        items: { create: { productId: produto.id, quantity: 2, unitPrice: 100 } },
        installments: { create: [
          { number: 1, value: 94.5, dueDate: new Date('2026-04-10T12:00:00Z'), paidAt: new Date('2026-04-10T12:00:00Z') },
          { number: 2, value: 94.5, dueDate: new Date('2026-05-10T12:00:00Z') },
        ] },
      },
    });
    await testPrisma.order.create({
      data: { userId: conta.id, status: 'CONFIRMED', saleId: venda.id, items: { create: { productId: produto.id, quantity: 2, unitPrice: 90 } } },
    });

    const [entrada] = (await historico(conta.id)).body.orders;

    // O pedido dizia 90 por unidade (180); a venda cobrou 189 com juros e desconto.
    expect(entrada).toMatchObject({ source: 'ORDER', saleId: venda.id, total: 189, discount: 20, interest: 9, couponCode: 'CICLO10' });
    expect(entrada.installments.map((p: { number: number }) => p.number)).toEqual([1, 2]);
    expect(entrada.pendingAmount).toBe(94.5);
    expect(entrada.isPaid).toBe(false);
  });

  it('com todas as parcelas pagas, está quitado e não falta nada', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const conta = await criarConta();
    const venda = await testPrisma.sale.create({
      data: { total: 10, installments: { create: { number: 1, value: 10, dueDate: new Date(), paidAt: new Date() } } },
    });
    await testPrisma.order.create({
      data: { userId: conta.id, status: 'CONFIRMED', saleId: venda.id, items: { create: { productId: produto.id, quantity: 1, unitPrice: 10 } } },
    });

    const [entrada] = (await historico(conta.id)).body.orders;

    expect(entrada).toMatchObject({ pendingAmount: 0, isPaid: true });
  });

  it('as parcelas saem em ordem de número, e só dizem o que a tela usa', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const conta = await criarConta();
    const venda = await testPrisma.sale.create({
      data: {
        total: 30,
        installments: { create: [3, 1, 2].map(number => ({ number, value: 10, dueDate: new Date('2026-06-01T12:00:00Z') })) },
      },
    });
    await testPrisma.order.create({
      data: { userId: conta.id, status: 'CONFIRMED', saleId: venda.id, items: { create: { productId: produto.id, quantity: 1, unitPrice: 30 } } },
    });

    const [entrada] = (await historico(conta.id)).body.orders;

    expect(entrada.installments.map((p: { number: number }) => p.number)).toEqual([1, 2, 3]);
    expect(Object.keys(entrada.installments[0]).sort()).toEqual(['dueDate', 'number', 'paidAt', 'value']);
    expect(entrada.pendingAmount).toBe(30);
  });

  it('cliente ligado pela loja: as vendas de balcão entram, e `linkedToCustomer` é verdadeiro', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10, nome: 'Creme' });
    const cliente = await criarCliente('Ana');
    const conta = await criarConta({ customerId: cliente.id });
    const balcao = await testPrisma.sale.create({
      data: { total: 20, discount: 2, customerId: cliente.id, items: { create: { productId: produto.id, quantity: 2, unitPrice: 11 } } },
    });

    const { body } = await historico(conta.id);

    expect(body.linkedToCustomer).toBe(true);
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toMatchObject({
      source: 'SALE', id: balcao.id, status: 'CONFIRMED', cancelReason: null, saleId: balcao.id,
      total: 20, discount: 2, interest: 0, couponCode: null,
      items: [{ name: 'Creme', quantity: 2, unitPrice: 11 }],
    });
  });

  it('a venda que nasceu de um pedido aparece uma vez só, como pedido', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const cliente = await criarCliente();
    const conta = await criarConta({ customerId: cliente.id });
    const venda = await testPrisma.sale.create({ data: { total: 10, customerId: cliente.id } });
    await testPrisma.order.create({
      data: { userId: conta.id, status: 'CONFIRMED', saleId: venda.id, items: { create: { productId: produto.id, quantity: 1, unitPrice: 10 } } },
    });

    const { body } = await historico(conta.id);

    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].source).toBe('ORDER');
  });

  it('venda de balcão de OUTRO cliente nunca aparece', async () => {
    const meu = await criarCliente('Meu');
    const alheio = await criarCliente('Alheio');
    const conta = await criarConta({ customerId: meu.id });
    await testPrisma.sale.create({ data: { total: 99, customerId: alheio.id } });

    expect((await historico(conta.id)).body.orders).toEqual([]);
  });

  it('pedidos e vendas de balcão vêm juntos, do mais novo para o mais antigo', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const cliente = await criarCliente();
    const conta = await criarConta({ customerId: cliente.id });
    const agora = Date.now();

    const velho = await testPrisma.order.create({
      data: { userId: conta.id, createdAt: new Date(agora - 30 * MINUTO), items: { create: { productId: produto.id, quantity: 1, unitPrice: 10 } } },
    });
    const meio = await testPrisma.sale.create({ data: { total: 5, date: new Date(agora - 20 * MINUTO), customerId: cliente.id } });
    const novo = await testPrisma.order.create({
      data: { userId: conta.id, createdAt: new Date(agora - 10 * MINUTO), items: { create: { productId: produto.id, quantity: 1, unitPrice: 10 } } },
    });
    const maisNovo = await testPrisma.sale.create({ data: { total: 7, date: new Date(agora - 5 * MINUTO), customerId: cliente.id } });

    const ids = (await historico(conta.id)).body.orders.map((o: { source: string; id: number }) => `${o.source}${o.id}`);

    expect(ids).toEqual([`SALE${maisNovo.id}`, `ORDER${novo.id}`, `SALE${meio.id}`, `ORDER${velho.id}`]);
  });

  it('só os 100 mais recentes de cada tipo', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const cliente = await criarCliente();
    const conta = await criarConta({ customerId: cliente.id });
    await testPrisma.sale.createMany({ data: Array.from({ length: 105 }, () => ({ total: 1, customerId: cliente.id })) });
    for (let i = 0; i < 102; i++) {
      await testPrisma.order.create({ data: { userId: conta.id, items: { create: { productId: produto.id, quantity: 1, unitPrice: 1 } } } });
    }

    const { body } = await historico(conta.id);

    expect(body.orders.filter((o: { source: string }) => o.source === 'ORDER')).toHaveLength(100);
    expect(body.orders.filter((o: { source: string }) => o.source === 'SALE')).toHaveLength(100);
  });

  it('só os pedidos DESTA conta', async () => {
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    const minha = await criarConta();
    const alheia = await criarConta();
    await testPrisma.order.create({ data: { userId: alheia.id, items: { create: { productId: produto.id, quantity: 1, unitPrice: 10 } } } });

    expect((await historico(minha.id)).body.orders).toEqual([]);
  });
});
