import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/server.js';
import { aplicarMigrations } from '../helpers/testDb.js';

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

const asAdmin = () => ({
  Authorization: `Bearer ${jwt.sign({ role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`,
  'Content-Type': 'application/json',
});

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
