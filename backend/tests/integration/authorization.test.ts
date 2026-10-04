import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/server.js';
import { aplicarMigrations } from '../helpers/testDb.js';

/**
 * Quem pode entrar em quê.
 *
 * Hoje isso é verdade por inspeção do `authMiddleware` — nada impede a próxima
 * rota de nascer sem o guard, e nada avisaria. É o único teste da suíte que sobe
 * o Express inteiro, porque autorização mora na costura entre rota e middleware:
 * testar o controller sozinho não diria nada sobre ela.
 *
 * Porta efêmera (`listen(0)`), para duas execuções simultâneas não brigarem.
 */

let server: Server;
let base: string;

beforeAll(async () => {
  aplicarMigrations();

  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

function autorizacao(payload: Record<string, unknown>) {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) throw new Error('JWT_SECRET ausente no ambiente de teste.');

  return { Authorization: `Bearer ${jwt.sign(payload, segredo, { expiresIn: '1h' })}` };
}

/** As rotas que só a loja pode ver. */
const ROTAS_DE_ADMIN = [
  '/sales',
  '/customers',
  '/analytics/dashboard-summary',
  '/orders',
  '/settings/installment-plans',
];

describe('rotas de admin', () => {
  it.each(ROTAS_DE_ADMIN)('%s recusa quem não mandou token', async rota => {
    expect((await fetch(`${base}${rota}`)).status).toBe(401);
  });

  it.each(ROTAS_DE_ADMIN)('%s recusa token de cliente', async rota => {
    // O caso que importa: a pessoa tem conta de verdade, logou de verdade, e
    // tenta a rota da loja.
    const r = await fetch(`${base}${rota}`, { headers: autorizacao({ userId: 1, role: 'customer' }) });
    expect(r.status).toBe(403);
  });

  it.each(ROTAS_DE_ADMIN)('%s recusa token assinado com outro segredo', async rota => {
    const forjado = jwt.sign({ userId: 1, role: 'admin' }, 'segredo-errado', { expiresIn: '1h' });
    const r = await fetch(`${base}${rota}`, { headers: { Authorization: `Bearer ${forjado}` } });
    expect(r.status).toBe(401);
  });

  it.each(ROTAS_DE_ADMIN)('%s recusa token expirado', async rota => {
    const segredo = process.env.JWT_SECRET!;
    const vencido = jwt.sign({ userId: 1, role: 'admin' }, segredo, { expiresIn: '-1h' });
    const r = await fetch(`${base}${rota}`, { headers: { Authorization: `Bearer ${vencido}` } });
    expect(r.status).toBe(401);
  });

  it('header malformado é recusado', async () => {
    for (const header of ['', 'Bearer', 'Basic abc', 'abc']) {
      const r = await fetch(`${base}/sales`, { headers: { Authorization: header } });
      expect(r.status).toBe(401);
    }
  });
});

describe('rotas públicas da vitrine', () => {
  it('/products/showcase responde sem token', async () => {
    expect((await fetch(`${base}/products/showcase`)).status).toBe(200);
  });

  it('/payment/options responde sem token', async () => {
    expect((await fetch(`${base}/payment/options?subtotal=100`)).status).toBe(200);
  });

  it('a raiz responde sem token', async () => {
    expect((await fetch(`${base}/`)).status).toBe(200);
  });
});

describe('rotas da conta do cliente', () => {
  it('/me recusa sem token', async () => {
    expect((await fetch(`${base}/me`)).status).toBe(401);
  });

  it('/me não é bloqueada para quem é cliente', async () => {
    const r = await fetch(`${base}/me`, { headers: autorizacao({ userId: 1, role: 'customer' }) });
    // 404 é aceitável: o usuário 1 pode não existir no banco limpo. O que não
    // pode é 401 ou 403 — o que se testa aqui é a autorização ter deixado passar.
    expect([200, 404]).toContain(r.status);
  });
});
