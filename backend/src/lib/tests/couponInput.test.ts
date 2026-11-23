import { describe, expect, it } from 'vitest';

import { parseCouponBody } from '../coupons.js';

/**
 * O corpo do cadastro de cupom. A lógica estava num `parseBody` de 50 linhas
 * dentro do controller, sem nenhum teste; agora é um schema.
 */

const ok = { code: 'ciclo10', type: 'PERCENT', value: 10 };

const erro = (body: unknown) => {
  const r = parseCouponBody(body);
  return r.ok ? null : r.error;
};

describe('parseCouponBody — código', () => {
  it('apara e põe em maiúscula', () => {
    expect(parseCouponBody({ ...ok, code: '  ciclo10 ' })).toMatchObject({ ok: true, data: { code: 'CICLO10' } });
  });

  it.each(['', 'ab', '-abc', 'a'.repeat(25), 'com espaço', 'açaí10', undefined])('recusa %j', (code) => {
    expect(erro({ ...ok, code })).toBe('O código precisa ter de 3 a 24 letras, números ou hífen.');
  });

  it('aceita de 3 a 24 caracteres, com hífen no meio', () => {
    expect(parseCouponBody({ ...ok, code: 'ABC' }).ok).toBe(true);
    expect(parseCouponBody({ ...ok, code: 'BEM-VINDO-2026' }).ok).toBe(true);
    expect(parseCouponBody({ ...ok, code: 'A'.repeat(24) }).ok).toBe(true);
  });
});

describe('parseCouponBody — tipo e valor', () => {
  it('qualquer coisa que não seja FIXED é percentual', () => {
    expect(parseCouponBody({ ...ok, type: 'FIXED' })).toMatchObject({ ok: true, data: { type: 'FIXED' } });
    for (const type of ['PERCENT', 'banana', undefined, null, 1]) {
      expect(parseCouponBody({ ...ok, type })).toMatchObject({ ok: true, data: { type: 'PERCENT' } });
    }
  });

  it('o valor chega como texto e vira número', () => {
    expect(parseCouponBody({ ...ok, value: '12.5' })).toMatchObject({ ok: true, data: { value: 12.5 } });
  });

  it.each([0, -5, '', 'abc', null, undefined, NaN, Infinity])('recusa o valor %j', (value) => {
    expect(erro({ ...ok, value })).toBe('Informe o valor do desconto.');
  });

  it('percentual passa de 100% só com a mensagem própria; valor fixo pode ser alto', () => {
    expect(erro({ ...ok, type: 'PERCENT', value: 100.01 })).toBe('Um desconto percentual não pode passar de 100%.');
    expect(parseCouponBody({ ...ok, type: 'PERCENT', value: 100 }).ok).toBe(true);
    expect(parseCouponBody({ ...ok, type: 'FIXED', value: 500 }).ok).toBe(true);
  });
});

describe('parseCouponBody — campos opcionais', () => {
  it('ausentes, nulos e vazios viram null', () => {
    for (const vazio of [undefined, null, '']) {
      expect(parseCouponBody({ ...ok, minimumTotal: vazio, maxUses: vazio, expiresAt: vazio })).toMatchObject({
        ok: true, data: { minimumTotal: null, maxUses: null, expiresAt: null },
      });
    }
  });

  it('pedido mínimo: zero vale, negativo e texto não', () => {
    expect(parseCouponBody({ ...ok, minimumTotal: '0' })).toMatchObject({ ok: true, data: { minimumTotal: 0 } });
    expect(parseCouponBody({ ...ok, minimumTotal: '80.5' })).toMatchObject({ ok: true, data: { minimumTotal: 80.5 } });
    for (const minimumTotal of [-1, 'abc']) expect(erro({ ...ok, minimumTotal })).toBe('Pedido mínimo inválido.');
  });

  it('limite de usos: inteiro de 1 para cima', () => {
    expect(parseCouponBody({ ...ok, maxUses: '3' })).toMatchObject({ ok: true, data: { maxUses: 3 } });
    for (const maxUses of [0, -2, 1.5, 'abc']) {
      expect(erro({ ...ok, maxUses })).toBe('O limite de usos precisa ser um número inteiro maior que zero.');
    }
  });
});

describe('parseCouponBody — validade', () => {
  it('"2026-09-30" é o fim do dia 30 no horário local, não o dia 29', () => {
    const r = parseCouponBody({ ...ok, expiresAt: '2026-09-30' });
    expect(r.ok && r.data.expiresAt).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
  });

  it('data com hora também vai para o fim do dia', () => {
    const r = parseCouponBody({ ...ok, expiresAt: '2026-09-30T10:00:00' });
    expect(r.ok && r.data.expiresAt).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
  });

  it.each(['ontem', '2026-13-45x', 'abc'])('recusa a data %j', (expiresAt) => {
    expect(erro({ ...ok, expiresAt })).toBe('Data de validade inválida.');
  });
});

describe('parseCouponBody — ativo e campos de fora', () => {
  it('ativo por padrão; só `false` desliga', () => {
    expect(parseCouponBody(ok)).toMatchObject({ ok: true, data: { active: true } });
    expect(parseCouponBody({ ...ok, active: false })).toMatchObject({ ok: true, data: { active: false } });
    expect(parseCouponBody({ ...ok, active: 'false' })).toMatchObject({ ok: true, data: { active: true } });
  });

  it('id e usedCount não se aceitam de fora', () => {
    const r = parseCouponBody({ ...ok, id: 99, usedCount: 5, createdAt: 'x' });
    expect(r.ok && Object.keys(r.data).sort()).toEqual(
      ['active', 'code', 'expiresAt', 'maxUses', 'minimumTotal', 'type', 'value']
    );
  });

  it('sem corpo, o primeiro que falta é o código', () => {
    expect(erro(undefined)).toBe('O código precisa ter de 3 a 24 letras, números ou hífen.');
  });
});
