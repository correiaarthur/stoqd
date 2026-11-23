import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';

import { adminCredentialFingerprint, signAdminToken, signCustomerToken, verifyAuthToken } from '../tokens.js';

/**
 * A impressão digital das credenciais do admin: o que faz o token dele poder ser
 * revogado sem uma linha no banco.
 */

const nomes = ['JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_PASSWORD_HASH'] as const;
const original: Partial<Record<(typeof nomes)[number], string | undefined>> = {};

beforeEach(() => {
  for (const nome of nomes) original[nome] = process.env[nome];
  process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
  process.env.ADMIN_EMAIL = 'admin@loja.test';
  process.env.ADMIN_PASSWORD = 'senha-em-texto';
  delete process.env.ADMIN_PASSWORD_HASH;
});

afterEach(() => {
  for (const nome of nomes) {
    if (original[nome] === undefined) delete process.env[nome];
    else process.env[nome] = original[nome];
  }
});

describe('adminCredentialFingerprint', () => {
  it('é estável: a mesma credencial dá a mesma impressão, a cada chamada', () => {
    expect(adminCredentialFingerprint()).toBe(adminCredentialFingerprint());
    expect(adminCredentialFingerprint()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('muda quando a senha em texto muda', () => {
    const antes = adminCredentialFingerprint();
    process.env.ADMIN_PASSWORD = 'outra-senha';
    expect(adminCredentialFingerprint()).not.toBe(antes);
  });

  it('muda quando o e-mail muda; maiúscula e espaço no e-mail não contam', () => {
    const antes = adminCredentialFingerprint();

    process.env.ADMIN_EMAIL = '  ADMIN@LOJA.TEST ';
    expect(adminCredentialFingerprint()).toBe(antes);

    process.env.ADMIN_EMAIL = 'outro@loja.test';
    expect(adminCredentialFingerprint()).not.toBe(antes);
  });

  it('o hash do .env, quando existe, vale no lugar da senha em texto — e muda com ele', () => {
    const emTexto = adminCredentialFingerprint();

    process.env.ADMIN_PASSWORD_HASH = '$2b$12$umhashqualquer';
    const comHash = adminCredentialFingerprint();
    expect(comHash).not.toBe(emTexto);

    // Com hash definido, a senha em texto é ignorada.
    process.env.ADMIN_PASSWORD = 'trocada-mas-irrelevante';
    expect(adminCredentialFingerprint()).toBe(comHash);

    process.env.ADMIN_PASSWORD_HASH = '$2b$12$outrohash';
    expect(adminCredentialFingerprint()).not.toBe(comHash);
  });

  it('depende do segredo do JWT: com outro segredo, a mesma credencial dá outra impressão', () => {
    const antes = adminCredentialFingerprint();
    process.env.JWT_SECRET = 'outro-segredo-com-mais-de-32-caracteres!!';
    expect(adminCredentialFingerprint()).not.toBe(antes);
  });

  it('não carrega a credencial: nem a senha nem o e-mail aparecem na impressão', () => {
    const impressao = adminCredentialFingerprint();
    expect(impressao).not.toContain('senha-em-texto');
    expect(impressao).not.toContain('admin@loja.test');
  });
});

describe('emitir tokens', () => {
  it('o do admin leva a função e a impressão, e nenhum userId', () => {
    expect(jwt.decode(signAdminToken())).toMatchObject({ role: 'admin', cf: adminCredentialFingerprint() });
    expect(jwt.decode(signAdminToken())).not.toHaveProperty('userId');
  });

  it('o do cliente leva a função, o id e a versão da sessão', () => {
    expect(jwt.decode(signCustomerToken({ id: 7, tokenVersion: 3 }))).toMatchObject({ role: 'customer', userId: 7, tv: 3 });
  });

  it('expira em um dia', () => {
    const { iat, exp } = jwt.decode(signAdminToken()) as { iat: number; exp: number };
    expect(exp - iat).toBe(24 * 60 * 60);
  });
});

describe('verifyAuthToken (o que dispensa o banco)', () => {
  it('admin com a impressão certa passa', async () => {
    expect(await verifyAuthToken(signAdminToken())).toEqual({ ok: true, auth: { role: 'admin' } });
  });

  it('assinado com outro segredo, ou lixo, é recusado como inválido', async () => {
    const forjado = jwt.sign({ role: 'admin', cf: adminCredentialFingerprint() }, 'outro-segredo-qualquer-123456789012345');

    for (const token of [forjado, 'lixo', '']) {
      expect(await verifyAuthToken(token)).toEqual({ ok: false, error: 'Token inválido ou expirado. Faça login novamente.' });
    }
  });

  it('sem função, ou com uma que não existe, é recusado', async () => {
    for (const role of [undefined, 'root', 'superadmin']) {
      const token = jwt.sign({ role }, process.env.JWT_SECRET!);
      expect(await verifyAuthToken(token)).toEqual({ ok: false, error: 'Token sem papel definido. Faça login novamente.' });
    }
  });

  it('admin sem impressão, ou com impressão de tamanho diferente, é recusado sem erro', async () => {
    for (const cf of [undefined, '', 'curta', 12345, null]) {
      const token = jwt.sign({ role: 'admin', cf }, process.env.JWT_SECRET!);
      expect(await verifyAuthToken(token)).toEqual({ ok: false, error: 'Sessão encerrada. Faça login novamente.' });
    }
  });

  it('cliente sem userId passa daqui: quem o recusa é requireCustomer, sem tocar no banco', async () => {
    const token = jwt.sign({ role: 'customer' }, process.env.JWT_SECRET!);
    expect(await verifyAuthToken(token)).toEqual({ ok: true, auth: { role: 'customer' } });
  });
});
