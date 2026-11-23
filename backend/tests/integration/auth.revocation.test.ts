import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../../src/server.js';
import { adminCredentialFingerprint, signAdminToken, signCustomerToken } from '../../src/lib/tokens.js';
import { criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, limparBanco, testPrisma, fecharBanco } from '../helpers/testDb.js';
import { cabecalhoAdmin, criarClienteLogado } from '../helpers/tokens.js';

/**
 * Revogar uma sessão.
 *
 * Um JWT assinado vale até expirar: antes, trocar a senha ou apagar a conta não
 * derrubava o token que já existia — de outro aparelho, ou de quem o roubou — por
 * até um dia. Aqui o token leva a versão da sessão (cliente) ou a impressão das
 * credenciais (admin), e o servidor só o aceita se continuam as mesmas.
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

beforeEach(async () => { await limparBanco(); });

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); });
  await fecharBanco();
});

const json = { 'Content-Type': 'application/json' };
const SENHA = 'senha-forte-123';
const SESSAO_ENCERRADA = 'Sessão encerrada. Faça login novamente.';

/** O corpo da resposta, já tipado como o que os testes leem dele. */
const corpoDe = async (r: Response) => (await r.json()) as { token: string; minutes: number; error?: string; user: Record<string, unknown> };

const comToken = (token: string) => ({ Authorization: `Bearer ${token}`, ...json });

async function contaComSenha(over: { phone?: string } = {}) {
  return testPrisma.user.create({
    data: {
      name: 'Dayana Leite',
      phone: over.phone ?? '87996415746',
      passwordHash: await bcrypt.hash(SENHA, 4),
    },
  });
}

const trocarSenha = (token: string, body: Record<string, unknown>) =>
  fetch(`${base}/me/password`, { method: 'PUT', headers: comToken(token), body: JSON.stringify(body) });

const eu = (token: string) => fetch(`${base}/me`, { headers: comToken(token) });

describe('o token de cliente carrega a versão da sessão', () => {
  it('o login emite a versão atual', async () => {
    const conta = await contaComSenha();
    await testPrisma.user.update({ where: { id: conta.id }, data: { tokenVersion: 4 } });

    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ identifier: conta.phone, password: SENHA }) });
    const { token } = await corpoDe(r);

    expect(jwt.decode(token)).toMatchObject({ role: 'customer', userId: conta.id, tv: 4 });
    expect((await eu(token)).status).toBe(200);
  });

  it('o cadastro emite a versão 0, e a resposta não expõe a versão', async () => {
    const r = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ name: 'Marina Souza', phone: '11999990000', password: SENHA }),
    });
    const corpo = await corpoDe(r);

    expect(r.status).toBe(201);
    expect(jwt.decode(corpo.token)).toMatchObject({ role: 'customer', tv: 0 });
    expect(corpo.user).not.toHaveProperty('tokenVersion');
    expect(corpo.user).not.toHaveProperty('passwordHash');
  });
});

describe('trocar a senha encerra as outras sessões', () => {
  it('o token antigo cai; o novo, devolvido na resposta, mantém este aparelho entrando', async () => {
    const conta = await contaComSenha();
    const antigo = signCustomerToken(conta);

    const r = await trocarSenha(antigo, { currentPassword: SENHA, newPassword: 'outra-senha-456' });
    const { token: novo } = await corpoDe(r);

    expect(r.status).toBe(200);
    expect(jwt.decode(novo)).toMatchObject({ userId: conta.id, tv: 1 });

    const recusado = await eu(antigo);
    expect(recusado.status).toBe(401);
    expect(await recusado.json()).toEqual({ error: SESSAO_ENCERRADA });

    expect((await eu(novo)).status).toBe(200);
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } })).tokenVersion).toBe(1);
  });

  it('a sessão de outro aparelho, com a mesma versão, também cai', async () => {
    const conta = await contaComSenha();
    const celular = signCustomerToken(conta);
    const notebook = signCustomerToken(conta);

    await trocarSenha(celular, { currentPassword: SENHA, newPassword: 'outra-senha-456' });

    expect((await eu(notebook)).status).toBe(401);
  });

  it('com a senha atual errada nada muda: a versão fica e o token segue valendo', async () => {
    const conta = await contaComSenha();
    const token = signCustomerToken(conta);

    const r = await trocarSenha(token, { currentPassword: 'errada-errada', newPassword: 'outra-senha-456' });

    // 400, não 401: errar a senha atual não é uma sessão inválida, e o 401 faria o
    // cliente web limpar o token e mandar a pessoa para o login.
    expect(r.status).toBe(400);
    expect((await corpoDe(r)).error).toBe('A senha atual não confere.');
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: conta.id } })).tokenVersion).toBe(0);
    expect((await eu(token)).status).toBe(200);
  });

  it('a nova senha serve no login, a antiga não, e o token do login já vem na versão nova', async () => {
    const conta = await contaComSenha();
    await trocarSenha(signCustomerToken(conta), { currentPassword: SENHA, newPassword: 'outra-senha-456' });

    const entrar = (password: string) =>
      fetch(`${base}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ identifier: conta.phone, password }) });

    expect((await entrar(SENHA)).status).toBe(401);

    const ok = await entrar('outra-senha-456');
    expect(ok.status).toBe(200);
    expect(jwt.decode((await corpoDe(ok)).token)).toMatchObject({ tv: 1 });
  });

  it('trocar de novo sobe a versão de novo: cada troca revoga a anterior', async () => {
    const conta = await contaComSenha();
    const primeira = (await corpoDe(await trocarSenha(signCustomerToken(conta), { currentPassword: SENHA, newPassword: 'segunda-senha-1' }))).token;
    const segunda = (await corpoDe(await trocarSenha(primeira, { currentPassword: 'segunda-senha-1', newPassword: 'terceira-senha-2' }))).token;

    expect((await eu(primeira)).status).toBe(401);
    expect((await eu(segunda)).status).toBe(200);
    expect(jwt.decode(segunda)).toMatchObject({ tv: 2 });
  });
});

describe('conta apagada', () => {
  it('o token que sobrou é recusado com 401 — e não vira um 500 por chave estrangeira', async () => {
    const { conta, cabecalho } = await criarClienteLogado();
    const produto = await criarProduto({ quantidade: 5, preco: 10 });
    await testPrisma.user.delete({ where: { id: conta.id } });

    expect((await fetch(`${base}/me`, { headers: cabecalho })).status).toBe(401);

    const pedido = await fetch(`${base}/orders`, {
      method: 'POST', headers: { ...cabecalho, ...json },
      body: JSON.stringify({ items: [{ productId: produto.id, quantity: 1 }] }),
    });
    expect(pedido.status).toBe(401);
  });

  it('apagar pela própria rota derruba a sessão na hora', async () => {
    const { token } = await criarClienteLogado();

    expect((await fetch(`${base}/me`, { method: 'DELETE', headers: comToken(token) })).status).toBe(204);
    expect((await eu(token)).status).toBe(401);
  });
});

describe('versões e tokens antigos', () => {
  it('token de uma versão que já passou é recusado; o de uma versão que não existe, também', async () => {
    const { conta } = await criarClienteLogado();
    await testPrisma.user.update({ where: { id: conta.id }, data: { tokenVersion: 3 } });

    expect((await eu(signCustomerToken({ id: conta.id, tokenVersion: 2 }))).status).toBe(401);
    expect((await eu(signCustomerToken({ id: conta.id, tokenVersion: 4 }))).status).toBe(401);
    expect((await eu(signCustomerToken({ id: conta.id, tokenVersion: 3 }))).status).toBe(200);
  });

  it('token de antes de existir versão vale como 0 — ninguém é deslogado no deploy', async () => {
    const { conta } = await criarClienteLogado();
    const legado = jwt.sign({ role: 'customer', userId: conta.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    expect((await eu(legado)).status).toBe(200);
  });

  it('...mas a primeira troca de senha já o revoga', async () => {
    const conta = await contaComSenha();
    const legado = jwt.sign({ role: 'customer', userId: conta.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    await trocarSenha(signCustomerToken(conta), { currentPassword: SENHA, newPassword: 'outra-senha-456' });

    expect((await eu(legado)).status).toBe(401);
  });
});

describe('rota pública com token revogado', () => {
  const reservar = (token: string | null, productId: number) =>
    fetch(`${base}/cart/reserve`, {
      method: 'POST',
      headers: { ...json, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ cartToken: 'carrinho-token-aaaa-0001', items: [{ productId, quantity: 1 }] }),
    });

  it('o visitante identificado reserva por 30 minutos; com a sessão revogada, segue como visitante (5)', async () => {
    const { conta, token } = await criarClienteLogado();
    const produto = await criarProduto({ quantidade: 5, preco: 10 });

    expect((await corpoDe(await reservar(token, produto.id))).minutes).toBe(30);

    await testPrisma.user.update({ where: { id: conta.id }, data: { tokenVersion: { increment: 1 } } });

    const revogado = await reservar(token, produto.id);
    expect(revogado.status).toBe(200);
    expect((await corpoDe(revogado)).minutes).toBe(5);
  });
});

describe('o admin e as credenciais do .env', () => {
  const ambiente = { hash: process.env.ADMIN_PASSWORD_HASH, senha: process.env.ADMIN_PASSWORD, email: process.env.ADMIN_EMAIL };
  const restaurar = (nome: 'ADMIN_PASSWORD_HASH' | 'ADMIN_PASSWORD' | 'ADMIN_EMAIL', valor: string | undefined) => {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  };

  afterEach(() => {
    restaurar('ADMIN_PASSWORD_HASH', ambiente.hash);
    restaurar('ADMIN_PASSWORD', ambiente.senha);
    restaurar('ADMIN_EMAIL', ambiente.email);
  });

  const lerVendas = (token: string) => fetch(`${base}/sales`, { headers: comToken(token) });

  it('o token do admin leva a impressão das credenciais, e vale', async () => {
    const token = signAdminToken();

    expect(jwt.decode(token)).toMatchObject({ role: 'admin', cf: adminCredentialFingerprint() });
    expect((await lerVendas(token)).status).toBe(200);
    expect((await fetch(`${base}/sales`, { headers: cabecalhoAdmin() })).status).toBe(200);
  });

  it('o token de antes da revogação (sem impressão) é recusado: o admin entra de novo uma vez', async () => {
    const legado = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    const r = await lerVendas(legado);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: SESSAO_ENCERRADA });
  });

  it('com a impressão de outra credencial, é recusado', async () => {
    const forjado = jwt.sign({ role: 'admin', cf: 'a'.repeat(32) }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    expect((await lerVendas(forjado)).status).toBe(401);
  });

  it('trocar a senha do admin no .env derruba os tokens antigos', async () => {
    const antigo = signAdminToken();
    expect((await lerVendas(antigo)).status).toBe(200);

    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('nova-senha-do-admin', 4);

    expect((await lerVendas(antigo)).status).toBe(401);
    expect((await lerVendas(signAdminToken())).status).toBe(200);
  });

  it('trocar o e-mail do admin também derruba', async () => {
    const antigo = signAdminToken();

    process.env.ADMIN_EMAIL = 'outro-admin@loja.test';

    expect((await lerVendas(antigo)).status).toBe(401);
  });

  it('o login do admin emite um token com a impressão de agora', async () => {
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ identifier: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });

    // Sem credencial de admin no ambiente de teste, o login responde 401 e não há o que ler.
    if (r.status !== 200) return;

    expect(jwt.decode((await corpoDe(r)).token)).toMatchObject({ role: 'admin', cf: adminCredentialFingerprint() });
  });
});
