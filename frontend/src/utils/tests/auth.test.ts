import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearToken, getRole, isAdmin, isCustomer, isTokenValid, saveToken } from '../auth';

/**
 * O papel de quem está logado, lido do próprio token no navegador.
 *
 * Serve só para a tela decidir o que mostrar — quem decide o que pode é o
 * servidor, e isso está coberto pelos 26 testes de autorização do backend.
 * Esconder um botão aqui não protege rota nenhuma, e os testes abaixo não devem
 * dar a impressão contrária.
 *
 * O que eles cobrem de fato: a tela não travar nem abrir sozinha por causa de um
 * token estranho. Token corrompido, sem `exp`, com payload que não é JSON — nada
 * disso pode virar "é admin".
 */

/** Monta um JWT de mentira: só o payload importa, a assinatura nunca é lida aqui. */
function tokenFalso(payload: Record<string, unknown>) {
  const base64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${base64({ alg: 'HS256' })}.${base64(payload)}.assinatura-ignorada`;
}

const DAQUI_UMA_HORA = () => Math.floor(Date.now() / 1000) + 3600;
const UMA_HORA_ATRAS = () => Math.floor(Date.now() / 1000) - 3600;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('isTokenValid', () => {
  it('token válido e no prazo', () => {
    expect(isTokenValid(tokenFalso({ role: 'admin', exp: DAQUI_UMA_HORA() }))).toBe(true);
  });

  it('token expirado não vale', () => {
    // Sem isto a rota abre, toda chamada volta 401, e o operador fica olhando
    // uma tela em branco sem saber por quê.
    expect(isTokenValid(tokenFalso({ role: 'admin', exp: UMA_HORA_ATRAS() }))).toBe(false);
  });

  it('sem exp não vale', () => {
    expect(isTokenValid(tokenFalso({ role: 'admin' }))).toBe(false);
  });

  it('exp que não é número não vale', () => {
    expect(isTokenValid(tokenFalso({ role: 'admin', exp: '9999999999' }))).toBe(false);
  });

  it('token ausente, vazio ou corrompido não vale — e não estoura', () => {
    for (const t of [null, '', 'abc', 'a.b.c', 'a.!!!.c', '...']) {
      expect(isTokenValid(t)).toBe(false);
    }
  });

  it('expira exatamente na virada', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    const exp = Math.floor(Date.parse('2026-06-01T12:00:00Z') / 1000);

    expect(isTokenValid(tokenFalso({ exp }))).toBe(false);
    expect(isTokenValid(tokenFalso({ exp: exp + 1 }))).toBe(true);
  });
});

describe('getRole', () => {
  it('lê admin e customer', () => {
    saveToken(tokenFalso({ role: 'admin', exp: DAQUI_UMA_HORA() }));
    expect(getRole()).toBe('admin');

    saveToken(tokenFalso({ role: 'customer', exp: DAQUI_UMA_HORA() }));
    expect(getRole()).toBe('customer');
  });

  it('papel desconhecido vira null, não passa adiante', () => {
    // Um `role: 'superadmin'` inventado não pode virar acesso a nada.
    for (const role of ['superadmin', 'root', '', 42, null, undefined]) {
      saveToken(tokenFalso({ role, exp: DAQUI_UMA_HORA() }));
      expect(getRole()).toBeNull();
    }
  });

  it('token expirado não tem papel, mesmo dizendo admin', () => {
    saveToken(tokenFalso({ role: 'admin', exp: UMA_HORA_ATRAS() }));
    expect(getRole()).toBeNull();
  });

  it('sem token não tem papel', () => {
    expect(getRole()).toBeNull();
  });
});

describe('isAdmin e isCustomer', () => {
  it('são mutuamente exclusivos', () => {
    saveToken(tokenFalso({ role: 'admin', exp: DAQUI_UMA_HORA() }));
    expect([isAdmin(), isCustomer()]).toEqual([true, false]);

    saveToken(tokenFalso({ role: 'customer', exp: DAQUI_UMA_HORA() }));
    expect([isAdmin(), isCustomer()]).toEqual([false, true]);
  });

  it('visitante não é nenhum dos dois', () => {
    expect([isAdmin(), isCustomer()]).toEqual([false, false]);
  });

  it('token corrompido não vira admin', () => {
    saveToken('lixo-que-nao-e-jwt');
    expect(isAdmin()).toBe(false);
  });
});

describe('saveToken e clearToken', () => {
  it('guardar e apagar', () => {
    saveToken(tokenFalso({ role: 'admin', exp: DAQUI_UMA_HORA() }));
    expect(isAdmin()).toBe(true);

    clearToken();
    expect(isAdmin()).toBe(false);
    expect(getRole()).toBeNull();
  });
});
