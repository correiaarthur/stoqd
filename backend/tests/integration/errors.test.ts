import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../../src/server.js';
import { aplicarMigrations, limparBanco } from '../helpers/testDb.js';
import { cabecalhoAdmin, criarClienteLogado } from '../helpers/tokens.js';

/**
 * O que a API responde quando algo sai do esperado: sempre JSON no formato
 * `{ error }`, nunca uma página HTML com stack trace.
 */

let server: Server;
let base: string;

beforeAll(async () => {
  aplicarMigrations();

  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

const asAdmin = () => ({ ...cabecalhoAdmin(), 'Content-Type': 'application/json' });

describe('erros genéricos', () => {
  it('rota inexistente responde 404 em JSON', async () => {
    const r = await fetch(`${base}/nao-existe`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'Rota não encontrada.' });
  });

  it('corpo JSON malformado responde 400 em JSON, sem stack', async () => {
    const r = await fetch(`${base}/brands`, { method: 'POST', headers: asAdmin(), body: '{ nome: ' });
    expect(r.status).toBe(400);

    const body = await r.json();
    expect(body).toEqual({ error: 'Requisição inválida.' });
  });

  it('corpo grande demais responde 413', async () => {
    const r = await fetch(`${base}/brands`, {
      method: 'POST',
      headers: asAdmin(),
      body: JSON.stringify({ name: 'x'.repeat(200_000) }),
    });
    expect(r.status).toBe(413);
  });

  it('/health responde sem token', async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok' });
  });
});

describe('ids e corpos inválidos nas rotas de admin', () => {
  it.each([
    ['PUT', '/brands/abc'],
    ['DELETE', '/brands/abc'],
    ['PUT', '/categories/abc'],
    ['DELETE', '/products/abc'],
    ['PUT', '/customers/abc'],
  ])('%s %s responde 400, não 500', async (method, rota) => {
    const r = await fetch(`${base}${rota}`, {
      method,
      headers: asAdmin(),
      ...(method === 'DELETE' ? {} : { body: '{"name":"x"}' }),
    });
    expect(r.status).toBe(400);
  });

  it('categoria sem nome é recusada', async () => {
    const r = await fetch(`${base}/categories`, { method: 'POST', headers: asAdmin(), body: '{}' });
    expect(r.status).toBe(400);
  });

  it('cliente de balcão com telefone curto é recusado', async () => {
    const r = await fetch(`${base}/customers`, {
      method: 'POST',
      headers: asAdmin(),
      body: JSON.stringify({ name: 'Ana', phone: '123' }),
    });
    expect(r.status).toBe(400);
  });
});

describe('token', () => {
  it('token de cliente sem userId é recusado em /me', async () => {
    const token = jwt.sign({ role: 'customer' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    const r = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(401);
  });

  it('token com algoritmo diferente de HS256 é recusado', async () => {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET!, { algorithm: 'HS512', expiresIn: '1h' });
    const r = await fetch(`${base}/sales`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(401);
  });
});

/**
 * Os schemas estão ligados aos controllers: cada rota responde 400 com a mensagem
 * do schema — a que o operador lê — e nada chega ao banco.
 */
describe('corpos e consultas inválidos respondem 400 com a mensagem do schema', () => {
  const enviar = (method: string, rota: string, body?: unknown) =>
    fetch(`${base}${rota}`, {
      method,
      headers: asAdmin(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const casos: Array<[string, string, string, unknown, string]> = [
    ['venda sem itens', 'POST', '/sales', { items: [] }, 'A venda precisa ter pelo menos um item.'],
    ['venda com forma de pagamento digitada errado', 'POST', '/sales', { items: [{ productId: 1, quantity: 1 }], paymentType: 'PRZO' }, 'Forma de pagamento inválida.'],
    ['venda a prazo em 0,5x', 'POST', '/sales', { items: [{ productId: 1, quantity: 1 }], paymentType: 'PRAZO', installmentsCount: 0.5 }, 'O parcelamento precisa ser de 1x a 12x.'],
    ['venda com cliente que não é número', 'POST', '/sales', { items: [{ productId: 1, quantity: 1 }], customerId: 'abc' }, 'Cliente inválido.'],
    ['lista de vendas com data inválida', 'GET', '/sales?from=ontem', undefined, 'Período inválido.'],
    ['relatório sem período', 'GET', '/analytics/sales-report', undefined, 'Informe a data inicial do período.'],
    ['relatório com data inválida', 'GET', '/analytics/sales-report?from=ontem', undefined, 'Data inicial inválida.'],
    ['lista de pedidos com situação desconhecida', 'GET', '/orders?status=DONE', undefined, 'Situação inválida.'],
    ['confirmar com preço desconhecido', 'POST', '/orders/1/confirm', { priceSource: 'hoje' }, 'Escolha se o pedido será cobrado pelo preço do pedido ou pelo preço de hoje.'],
    ['confirmar com parcelas absurdas', 'POST', '/orders/1/confirm', { installmentsCount: 99 }, 'O parcelamento precisa ser de 1x a 12x.'],
    ['recusar sem motivo', 'POST', '/orders/1/cancel', { reason: 'ab' }, 'Explique o motivo da recusa — é o que o cliente vai ler.'],
    ['cupom com código curto', 'POST', '/coupons', { code: 'ab', value: 10 }, 'O código precisa ter de 3 a 24 letras, números ou hífen.'],
    ['cupom percentual acima de 100', 'POST', '/coupons', { code: 'ABC', type: 'PERCENT', value: 150 }, 'Um desconto percentual não pode passar de 100%.'],
    ['parcelamento com faixa repetida', 'PUT', '/settings/installments', { plans: [{ installments: 3, interestPercent: 0 }, { installments: 3, interestPercent: 1 }] }, '3x aparece duas vezes.'],
    ['parcelamento sem a lista', 'PUT', '/settings/installments', {}, 'Envie as opções de parcelamento.'],
    ['produto com validade que não existe', 'POST', '/products', { name: 'X', brandId: 1, expiryDate: '2026-02-30' }, 'A data de validade não é válida.'],
    ['marca sem nome', 'POST', '/brands', {}, 'Nome é obrigatório'],
    ['categoria com nome longo demais', 'PUT', '/categories/1', { name: 'a'.repeat(101) }, 'O novo nome é obrigatório'],
    ['cliente com e-mail inválido', 'POST', '/customers', { name: 'Ana', email: 'nao-e-email' }, 'O e-mail informado não parece válido.'],
    ['upload de algo que não é imagem', 'POST', '/uploads/product-image', { contentType: 'text/html', size: 100 }, 'Envie uma imagem JPG, PNG ou WebP.'],
    ['upload de imagem grande demais', 'POST', '/uploads/product-image', { contentType: 'image/png', size: 6 * 1024 * 1024 }, 'A imagem precisa ter até 5 MB.'],
    ['upload sem tamanho', 'POST', '/uploads/product-image', { contentType: 'image/png' }, 'A imagem precisa ter até 5 MB.'],
    ['cupom com id zero', 'DELETE', '/coupons/0', undefined, 'Cupom inválido.'],
    ['pagar parcela com id que não é número', 'PATCH', '/installments/abc/pay', undefined, 'Parcela inválida.'],
  ];

  it.each(casos)('%s', async (_nome, method, rota, body, mensagem) => {
    const r = await enviar(method, rota, body);

    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: mensagem });
  });

  it('o corpo malformado não chega ao schema: o handler global responde antes', async () => {
    const r = await fetch(`${base}/sales`, { method: 'POST', headers: asAdmin(), body: '{ ruim' });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Requisição inválida.' });
  });
});

describe('conta: cadastro e troca de senha', () => {
  // Os telefones de teste se repetem entre arquivos: sem limpar, uma conta deixada
  // por outro arquivo bate na restrição de telefone único.
  beforeEach(async () => { await limparBanco(); });

  const cadastrar = (body: unknown) =>
    fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('o cadastro recusa senha curta, com a mensagem do schema', async () => {
    const r = await cadastrar({ name: 'Ana', phone: '11999990000', password: '123' });

    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  });

  it('o cadastro recusa senha acima de 72 bytes, que o bcrypt truncaria em silêncio', async () => {
    const r = await cadastrar({ name: 'Ana', phone: '11999990000', password: 'a'.repeat(73) });

    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'A senha pode ter no máximo 72 caracteres.' });
  });

  it('trocar a senha com a nova curta responde 400', async () => {
    const { cabecalho } = await criarClienteLogado();
    const r = await fetch(`${base}/me/password`, {
      method: 'PUT',
      headers: { ...cabecalho, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'x', newPassword: '123' }),
    });

    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  });
});
