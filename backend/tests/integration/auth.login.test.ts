import type { Request, Response } from 'express';

import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { login } from '../../src/controllers/auth.controller.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * Quem entra com o quê: o cliente, pelo telefone; a administração, pelo e-mail.
 * Um campo só serve aos dois, então o que se verifica é que cada tipo de
 * identificador leva ao tipo certo de conta — e que o erro não entrega o
 * e-mail do admin a quem tenta adivinhar.
 */

const ADMIN_EMAIL = 'loja@exemplo.com';
const ADMIN_SENHA = 'senha-da-loja-123';
const CLIENTE_TELEFONE = '87999990000';
const CLIENTE_SENHA = 'senha-da-cliente-1';

beforeAll(() => {
  aplicarMigrations();
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_SENHA;
  delete process.env.ADMIN_PASSWORD_HASH;
  process.env.JWT_SECRET ??= 'segredo-de-teste';
});
beforeEach(async () => {
  await limparBanco();
  await testPrisma.user.create({
    data: {
      name: 'Cliente de teste',
      phone: CLIENTE_TELEFONE,
      email: 'cliente@exemplo.com',
      passwordHash: await bcrypt.hash(CLIENTE_SENHA, 4),
    },
  });
});
afterAll(async () => { await fecharBanco(); });

async function entrar(identifier: string, password: string) {
  const capturado = { status: 200, body: null as unknown };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
  };
  await login({ body: { identifier, password } } as Request, res as unknown as Response);
  return { status: capturado.status, body: capturado.body as { error?: string; user?: { role: string } } };
}

describe('POST /auth/login', () => {
  it('cliente entra pelo telefone — com ou sem a pontuação', async () => {
    expect((await entrar(CLIENTE_TELEFONE, CLIENTE_SENHA)).body.user?.role).toBe('customer');
    expect((await entrar('(87) 99999-0000', CLIENTE_SENHA)).body.user?.role).toBe('customer');
  });

  it('administração entra pelo e-mail, sem diferenciar maiúsculas', async () => {
    expect((await entrar(ADMIN_EMAIL, ADMIN_SENHA)).body.user?.role).toBe('admin');
    expect((await entrar('Loja@Exemplo.COM', ADMIN_SENHA)).body.user?.role).toBe('admin');
  });

  it('o e-mail do cliente não serve para entrar: o acesso dele é o telefone', async () => {
    const r = await entrar('cliente@exemplo.com', CLIENTE_SENHA);

    expect(r.status).toBe(401);
  });

  it('senha errada recusa nos dois caminhos', async () => {
    expect((await entrar(CLIENTE_TELEFONE, 'errada')).status).toBe(401);
    expect((await entrar(ADMIN_EMAIL, 'errada')).status).toBe(401);
  });

  it('o erro de e-mail é o mesmo para o e-mail do admin e para qualquer outro', async () => {
    const doAdmin = await entrar(ADMIN_EMAIL, 'errada');
    const deOutro = await entrar('outra@exemplo.com', 'errada');

    expect(doAdmin.body.error).toBe(deOutro.body.error);
    expect(doAdmin.body.error).toMatch(/e-mail ou senha/i);
  });

  it('o erro do telefone fala em telefone', async () => {
    expect((await entrar(CLIENTE_TELEFONE, 'errada')).body.error).toMatch(/telefone ou senha/i);
  });
});
