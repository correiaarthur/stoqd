import { describe, expect, it } from 'vitest';

import { formatBRL } from '../format.js';

/** Vai para dentro de mensagem que o cliente lê, então o formato importa. */
describe('formatBRL', () => {
  it('escreve reais como o Brasil escreve', () => {
    //   é o espaço fixo que o Intl insere depois de R$.
    expect(formatBRL(1234.56)).toBe('R$ 1.234,56');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('sempre mostra dois decimais', () => {
    expect(formatBRL(10)).toBe('R$ 10,00');
    expect(formatBRL(10.5)).toBe('R$ 10,50');
  });

  it('arredonda o terceiro decimal', () => {
    expect(formatBRL(10.999)).toBe('R$ 11,00');
  });
});
