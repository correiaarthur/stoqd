import { describe, expect, it } from 'vitest';

import { parseCartItems, parseCartToken } from '../cartItems.js';

/**
 * A fronteira entre o que o navegador manda e o que o servidor acredita.
 *
 * Quantidade negativa é o caso que justifica o rigor: passaria na checagem de
 * estoque, *aumentaria* o estoque no decremento e reduziria o total.
 */

const LIMITES = { maxLines: 30, maxUnits: 50 };

describe('parseCartItems', () => {
  it('aceita uma lista válida e devolve só productId e quantity', () => {
    const r = parseCartItems([{ productId: 7, quantity: 2, preco: 'ignorado' }], LIMITES);
    expect(r).toEqual({ ok: true, items: [{ productId: 7, quantity: 2 }] });
  });

  it('recusa o que não é lista, e lista vazia', () => {
    for (const entrada of [null, undefined, {}, 'abc', 42, []]) {
      expect(parseCartItems(entrada, LIMITES)).toMatchObject({ ok: false });
    }
  });

  it('recusa quantidade negativa', () => {
    // O caso que o comentário do módulo chama de perigoso.
    expect(parseCartItems([{ productId: 1, quantity: -3 }], LIMITES)).toMatchObject({ ok: false });
  });

  it('recusa quantidade zero e fracionária', () => {
    expect(parseCartItems([{ productId: 1, quantity: 0 }], LIMITES)).toMatchObject({ ok: false });
    expect(parseCartItems([{ productId: 1, quantity: 1.5 }], LIMITES)).toMatchObject({ ok: false });
  });

  it('recusa productId inválido', () => {
    for (const id of [0, -1, 1.5, 'abc', null, undefined, NaN]) {
      expect(parseCartItems([{ productId: id, quantity: 1 }], LIMITES)).toMatchObject({ ok: false });
    }
  });

  it('recusa o mesmo produto duas vezes', () => {
    const r = parseCartItems([{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }], LIMITES);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain('mais de uma vez');
  });

  it('recusa acima do teto de linhas', () => {
    const muitas = Array.from({ length: 31 }, (_, i) => ({ productId: i + 1, quantity: 1 }));
    const r = parseCartItems(muitas, LIMITES);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain('30 produtos diferentes');
  });

  it('recusa acima do teto de unidades somadas', () => {
    const r = parseCartItems([{ productId: 1, quantity: 30 }, { productId: 2, quantity: 21 }], LIMITES);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain('50 unidades');
  });

  it('exatamente no teto de unidades passa', () => {
    expect(parseCartItems([{ productId: 1, quantity: 50 }], LIMITES).ok).toBe(true);
  });

  it('item inválido é recusado antes do teto de unidades', () => {
    // Documenta a ordem atual: a validação por item roda no laço, o teto de
    // unidades só depois. Uma lista com os dois problemas reporta o do item.
    const r = parseCartItems([{ productId: 1, quantity: 999 }, { productId: 0, quantity: 1 }], LIMITES);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toBe('Item inválido no carrinho.');
  });

  it('aceita número em string, porque passa por Number()', () => {
    // Comportamento atual: `Number('7')` é 7 e é inteiro. Registrado para que
    // endurecer isso seja uma decisão consciente.
    expect(parseCartItems([{ productId: '7', quantity: '2' }], LIMITES)).toEqual({
      ok: true,
      items: [{ productId: 7, quantity: 2 }],
    });
  });
});

describe('parseCartToken', () => {
  it('aceita de 16 a 64 caracteres entre letra, número, hífen e sublinhado', () => {
    expect(parseCartToken('a'.repeat(16))).toBe('a'.repeat(16));
    expect(parseCartToken('A-b_9'.repeat(4))).toBe('A-b_9'.repeat(4));
    expect(parseCartToken('z'.repeat(64))).toBe('z'.repeat(64));
  });

  it('apara antes de validar', () => {
    expect(parseCartToken(`  ${'a'.repeat(20)}  `)).toBe('a'.repeat(20));
  });

  it('devolve null para curto, longo, vazio e caractere de fora', () => {
    expect(parseCartToken('a'.repeat(15))).toBeNull();
    expect(parseCartToken('a'.repeat(65))).toBeNull();
    expect(parseCartToken('')).toBeNull();
    expect(parseCartToken(null)).toBeNull();
    expect(parseCartToken(undefined)).toBeNull();
    expect(parseCartToken(`${'a'.repeat(16)} b`)).toBeNull();
    expect(parseCartToken(`${'a'.repeat(16)}/x`)).toBeNull();
  });
});
