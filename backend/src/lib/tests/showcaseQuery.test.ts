import { describe, expect, it } from 'vitest';

import {
  encodeShowcaseCursor, parseShowcaseCursor, parseShowcaseQuery, SHOWCASE_PAGE_DEFAULT, SHOWCASE_PAGE_MAX,
} from '../showcaseQuery.js';

describe('parseShowcaseQuery', () => {
  it('sem parâmetros: página padrão, do começo, sem filtro', () => {
    expect(parseShowcaseQuery({})).toEqual({
      limit: SHOWCASE_PAGE_DEFAULT, cursor: null, q: '', brands: [], categories: [], promo: false,
    });
  });

  it('limite acima do teto é cortado, não recusado', () => {
    expect(parseShowcaseQuery({ limit: '5000' }).limit).toBe(SHOWCASE_PAGE_MAX);
  });

  it('limite e cursor estranhos viram o padrão em vez de erro', () => {
    const f = parseShowcaseQuery({ limit: '-3', cursor: 'abc' });
    expect(f.limit).toBe(SHOWCASE_PAGE_DEFAULT);
    expect(f.cursor).toBeNull();
  });

  it('marca repetida na URL chega como lista; uma só, como lista de um', () => {
    expect(parseShowcaseQuery({ brand: ['Avon', 'Natura'] }).brands).toEqual(['Avon', 'Natura']);
    expect(parseShowcaseQuery({ brand: 'Avon' }).brands).toEqual(['Avon']);
  });

  it('descarta valores vazios', () => {
    expect(parseShowcaseQuery({ category: ['', '  ', 'Corpo'] }).categories).toEqual(['Corpo']);
  });

  it('promo só liga com 1 ou true', () => {
    expect(parseShowcaseQuery({ promo: '1' }).promo).toBe(true);
    expect(parseShowcaseQuery({ promo: 'true' }).promo).toBe(true);
    expect(parseShowcaseQuery({ promo: 'sim' }).promo).toBe(false);
  });

  it('cursor traz a fase e o último id', () => {
    expect(parseShowcaseQuery({ cursor: 'i:42' }).cursor).toEqual({ phase: 'in', id: 42 });
    expect(parseShowcaseQuery({ cursor: 'o:7' }).cursor).toEqual({ phase: 'out', id: 7 });
    expect(parseShowcaseQuery({ cursor: 'o:' }).cursor).toEqual({ phase: 'out', id: null });
  });

  it('cursor numérico de antes das fases vale como "com estoque"', () => {
    expect(parseShowcaseCursor('42')).toEqual({ phase: 'in', id: 42 });
  });

  it('cursor malformado é ignorado: volta ao começo em vez de erro', () => {
    for (const ruim of ['x:1', 'i:abc', 'i:-3', 'i:0', 'lixo']) {
      expect(parseShowcaseCursor(ruim)).toBeNull();
    }
  });

  it('o cursor que sai é o que entra', () => {
    expect(parseShowcaseCursor(encodeShowcaseCursor('in', 9))).toEqual({ phase: 'in', id: 9 });
    expect(parseShowcaseCursor(encodeShowcaseCursor('out', null))).toEqual({ phase: 'out', id: null });
  });

  it('busca é aparada e tem tamanho máximo', () => {
    expect(parseShowcaseQuery({ q: '  shampoo ' }).q).toBe('shampoo');
    expect(parseShowcaseQuery({ q: 'x'.repeat(500) }).q).toHaveLength(100);
  });
});
