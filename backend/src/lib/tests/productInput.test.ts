import { describe, expect, it } from 'vitest';

import { mergeAverageCost, mergeExpiryDates, parseProductInput } from '../productInput.js';

/**
 * A fronteira do cadastro de produto.
 *
 * Cada caso aqui corresponde a um furo medido contra o banco antes da correção:
 * `quantity: -5` gravava estoque negativo com HTTP 201, custo zero derrubava o
 * custo médio pela metade, e `name` ausente virava 500.
 */

const VALIDO = {
  name: 'Café 500g',
  brandId: 3,
  categoryId: 2,
  quantity: 10,
  averageCost: 12.5,
  sellingPrice: 25,
  promotionalPrice: null,
  expiryDate: null,
  imageUrl: null,
};

describe('parseProductInput — nome', () => {
  it('apara o nome', () => {
    const r = parseProductInput({ ...VALIDO, name: '  Café 500g  ' });
    expect(r.ok && r.data.name).toBe('Café 500g');
  });

  it('recusa nome ausente, vazio ou só espaço', () => {
    for (const name of [undefined, null, '', '   ']) {
      const r = parseProductInput({ ...VALIDO, name });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('nome');
    }
  });

  it('recusa nome absurdamente longo', () => {
    expect(parseProductInput({ ...VALIDO, name: 'a'.repeat(201) }).ok).toBe(false);
  });
});

describe('parseProductInput — quantidade', () => {
  it('recusa quantidade negativa', () => {
    // O furo: `Number(-5) || 0` é -5, e o produto nascia com estoque negativo.
    const r = parseProductInput({ ...VALIDO, quantity: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('zero para cima');
  });

  it('aceita zero — produto esgotado é cadastro válido', () => {
    expect(parseProductInput({ ...VALIDO, quantity: 0 }).ok).toBe(true);
  });

  it('recusa quantidade fracionária', () => {
    expect(parseProductInput({ ...VALIDO, quantity: 1.5 }).ok).toBe(false);
  });

  it('recusa quantidade absurda — é erro de digitação', () => {
    expect(parseProductInput({ ...VALIDO, quantity: 99_000_000 }).ok).toBe(false);
  });

  it('quantidade ausente vira zero', () => {
    const r = parseProductInput({ ...VALIDO, quantity: undefined });
    expect(r.ok && r.data.quantity).toBe(0);
  });
});

describe('parseProductInput — marca e categoria', () => {
  it('exige marca', () => {
    for (const brandId of [undefined, null, 0, -1, 'abc', 1.5]) {
      expect(parseProductInput({ ...VALIDO, brandId }).ok).toBe(false);
    }
  });

  it('categoria é opcional', () => {
    for (const categoryId of [undefined, null, '']) {
      const r = parseProductInput({ ...VALIDO, categoryId });
      expect(r.ok && r.data.categoryId).toBeNull();
    }
  });

  it('categoria inválida é recusada, não silenciosamente descartada', () => {
    expect(parseProductInput({ ...VALIDO, categoryId: -3 }).ok).toBe(false);
  });
});

describe('parseProductInput — valores', () => {
  it('recusa custo e preço negativos', () => {
    expect(parseProductInput({ ...VALIDO, averageCost: -1 }).ok).toBe(false);
    expect(parseProductInput({ ...VALIDO, sellingPrice: -1 }).ok).toBe(false);
    expect(parseProductInput({ ...VALIDO, promotionalPrice: -1 }).ok).toBe(false);
  });

  it('recusa valor não numérico', () => {
    expect(parseProductInput({ ...VALIDO, sellingPrice: 'muito caro' }).ok).toBe(false);
    expect(parseProductInput({ ...VALIDO, averageCost: NaN }).ok).toBe(false);
    expect(parseProductInput({ ...VALIDO, sellingPrice: Infinity }).ok).toBe(false);
  });

  it('promoção vazia é ausência de promoção', () => {
    for (const promotionalPrice of [undefined, null, '']) {
      const r = parseProductInput({ ...VALIDO, promotionalPrice });
      expect(r.ok && r.data.promotionalPrice).toBeNull();
    }
  });
});

describe('parseProductInput — validade', () => {
  it('guarda só o dia, à meia-noite UTC', () => {
    // Normalizar aqui é o que permite comparar com "hoje" sem o fuso mover a
    // data um dia.
    const r = parseProductInput({ ...VALIDO, expiryDate: '2026-04-06T00:00:00.000Z' });
    expect(r.ok && r.data.expiryDate?.toISOString()).toBe('2026-04-06T00:00:00.000Z');
  });

  it('aceita data sem hora', () => {
    const r = parseProductInput({ ...VALIDO, expiryDate: '2026-04-06' });
    expect(r.ok && r.data.expiryDate?.toISOString()).toBe('2026-04-06T00:00:00.000Z');
  });

  it('descarta a hora que vier junto', () => {
    const r = parseProductInput({ ...VALIDO, expiryDate: '2026-04-06T21:30:00.000Z' });
    expect(r.ok && r.data.expiryDate?.toISOString()).toBe('2026-04-06T00:00:00.000Z');
  });

  it('validade vazia é válida — não todo produto tem', () => {
    for (const expiryDate of [undefined, null, '']) {
      const r = parseProductInput({ ...VALIDO, expiryDate });
      expect(r.ok && r.data.expiryDate).toBeNull();
    }
  });

  it('recusa data mal formada em vez de gravar 1970', () => {
    expect(parseProductInput({ ...VALIDO, expiryDate: 'ontem' }).ok).toBe(false);
  });
});

describe('mergeAverageCost', () => {
  it('média ponderada quando os dois lados têm custo', () => {
    // 10 un a 10 + 10 un a 20 = 15
    expect(mergeAverageCost({ quantity: 10, averageCost: 10 }, { quantity: 10, averageCost: 20 })).toBe(15);
  });

  it('custo zero na entrada NÃO entra na média', () => {
    // O bug: um produto com custo 50 caía para 25 ao receber 10 unidades sem
    // custo informado — e o lucro no Dashboard subia na mesma proporção.
    expect(mergeAverageCost({ quantity: 10, averageCost: 50 }, { quantity: 10, averageCost: 0 })).toBe(50);
  });

  it('produto sem custo cadastrado assume o custo da entrada', () => {
    expect(mergeAverageCost({ quantity: 10, averageCost: 0 }, { quantity: 5, averageCost: 30 })).toBe(30);
  });

  it('produto esgotado assume o custo da entrada', () => {
    expect(mergeAverageCost({ quantity: 0, averageCost: 40 }, { quantity: 5, averageCost: 30 })).toBe(30);
  });

  it('pondera pela quantidade, não pela média simples', () => {
    // 90 un a 10 + 10 un a 20 = 11, não 15.
    expect(mergeAverageCost({ quantity: 90, averageCost: 10 }, { quantity: 10, averageCost: 20 })).toBe(11);
  });
});

describe('mergeExpiryDates', () => {
  it('mantém a que vence primeiro', () => {
    const perto = new Date('2026-04-01T00:00:00Z');
    const longe = new Date('2026-09-01T00:00:00Z');

    expect(mergeExpiryDates(longe, perto)).toEqual(perto);
    expect(mergeExpiryDates(perto, longe)).toEqual(perto);
  });

  it('entrada sem data não apaga a que havia', () => {
    const atual = new Date('2026-04-01T00:00:00Z');
    expect(mergeExpiryDates(atual, null)).toEqual(atual);
  });

  it('produto sem data assume a da entrada', () => {
    const nova = new Date('2026-04-01T00:00:00Z');
    expect(mergeExpiryDates(null, nova)).toEqual(nova);
  });
});
