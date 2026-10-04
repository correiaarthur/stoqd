import { describe, expect, it } from 'vitest';

import { PRODUCT_PRICING_SELECT, PRODUCT_STOCK_SELECT, getActivePrice } from './pricing.js';

/**
 * Qual preço o cliente paga. Zero produtos em promoção no banco hoje, então o
 * ramo promocional nunca rodou em produção.
 */

describe('getActivePrice', () => {
  it('sem promoção, cobra o preço de venda', () => {
    expect(getActivePrice({ sellingPrice: 50, promotionalPrice: null })).toBe(50);
  });

  it('com promoção, cobra a promoção', () => {
    expect(getActivePrice({ sellingPrice: 50, promotionalPrice: 39.9 })).toBe(39.9);
  });

  it('promoção maior que o preço normal é cobrada mesmo assim', () => {
    // Comportamento atual: a função obedece, não questiona. Quem impede o
    // cadastro incoerente seria a validação do produto — que hoje não impede.
    expect(getActivePrice({ sellingPrice: 50, promotionalPrice: 80 })).toBe(80);
  });

  it('promoção zero cai no preço de venda', () => {
    // `promotionalPrice ? ... : ...` trata 0 como ausência. Registrado porque
    // "promoção de R$ 0,00" e "sem promoção" são indistinguíveis aqui.
    expect(getActivePrice({ sellingPrice: 50, promotionalPrice: 0 })).toBe(50);
  });
});

describe('selects compartilhados', () => {
  it('o de estoque contém o de preço', () => {
    // A relação que justifica existirem dois: o largo deriva do estreito, em
    // vez de serem duas listas mantidas em paralelo.
    for (const campo of Object.keys(PRODUCT_PRICING_SELECT)) {
      expect(PRODUCT_STOCK_SELECT).toHaveProperty(campo, true);
    }
  });

  it('o de preço traz o que getActivePrice consome', () => {
    expect(PRODUCT_PRICING_SELECT).toMatchObject({
      sellingPrice: true,
      promotionalPrice: true,
    });
  });

  it('o de estoque acrescenta nome e quantidade, para as mensagens', () => {
    expect(PRODUCT_STOCK_SELECT).toMatchObject({ name: true, quantity: true });
  });
});
