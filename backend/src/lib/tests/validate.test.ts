import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { bodyOf, isBlank, money, optional, parseWith, positiveInt, trimmed } from '../validate.js';

describe('parseWith', () => {
  const schema = z.object({ n: z.number({ error: 'n precisa ser número.' }), m: z.number({ error: 'm precisa ser número.' }) });

  it('devolve o dado convertido quando é válido', () => {
    expect(parseWith(schema, { n: 1, m: 2 })).toEqual({ ok: true, data: { n: 1, m: 2 } });
  });

  it('devolve só a primeira mensagem, na ordem das chaves do schema', () => {
    expect(parseWith(schema, { n: 'a', m: 'b' })).toEqual({ ok: false, error: 'n precisa ser número.' });
    expect(parseWith(schema, { n: 1, m: 'b' })).toEqual({ ok: false, error: 'm precisa ser número.' });
  });

  it('mensagem que o schema não definiu sai em português, nunca no inglês do Zod', () => {
    const r = parseWith(z.object({ nome: z.string() }), { nome: 1 });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error).not.toMatch(/Invalid input|expected|received/i);
  });
});

describe('bodyOf', () => {
  const body = bodyOf({ name: trimmed.pipe(z.string().min(1, { error: 'Falta o nome.' })) });

  it('lê um objeto e descarta as chaves que não são do schema', () => {
    expect(parseWith(body, { name: ' Ana ', admin: true })).toEqual({ ok: true, data: { name: 'Ana' } });
  });

  it.each([undefined, null, 'texto', 42, true, [1, 2]])('%j vale como objeto vazio: diz o que falta', (corpo) => {
    expect(parseWith(body, corpo)).toEqual({ ok: false, error: 'Falta o nome.' });
  });
});

describe('primitivas', () => {
  it('isBlank: ausente, nulo e vazio — mas não zero nem false', () => {
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank('')).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank(false)).toBe(false);
    expect(isBlank(' ')).toBe(false);
  });

  it('optional: o campo não informado vira null; o informado passa pelo schema', () => {
    const schema = optional(positiveInt('inválido'));

    for (const vazio of [undefined, null, '']) expect(schema.safeParse(vazio).data).toBeNull();
    expect(schema.safeParse('7').data).toBe(7);
    expect(schema.safeParse('x').success).toBe(false);
    expect(schema.safeParse(0).success).toBe(false); // zero é informado, e não serve
  });

  it('positiveInt: lê como Number() e recusa o que não é inteiro maior que zero', () => {
    const schema = positiveInt('inválido');

    expect(schema.safeParse('3').data).toBe(3);
    for (const ruim of [0, -1, 1.5, 'abc', '', null, undefined, NaN, Infinity]) {
      expect(schema.safeParse(ruim).success, String(ruim)).toBe(false);
    }
  });

  it('money: de zero até o teto, finito', () => {
    const schema = money('inválido', 100);

    expect(schema.safeParse('0').data).toBe(0);
    expect(schema.safeParse(100).data).toBe(100);
    for (const ruim of [-0.01, 100.01, 'abc', Infinity, NaN]) {
      expect(schema.safeParse(ruim).success, String(ruim)).toBe(false);
    }
  });

  it('trimmed: apara, e ausente vale texto vazio', () => {
    expect(trimmed.parse('  oi  ')).toBe('oi');
    expect(trimmed.parse(undefined)).toBe('');
    expect(trimmed.parse(null)).toBe('');
  });
});
