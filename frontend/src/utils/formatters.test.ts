import { describe, expect, it } from 'vitest';

import { formatCurrency, parseCurrencyInput, parsePercentInput } from './formatters';

/**
 * `parseCurrencyInput` e `parsePercentInput` são as duas únicas regras de
 * negócio que vivem dentro do painel de venda do Checkout — são elas que
 * traduzem o que o caixa digita no desconto. Travar o comportamento aqui é o
 * que permite extrair `useDiscountInput` depois sem adivinhar.
 */

const NBSP = ' ';

describe('formatCurrency', () => {
  it('formata número como real', () => {
    expect(formatCurrency(1234.56)).toBe(`R$${NBSP}1.234,56`);
  });

  it('aceita string numérica', () => {
    expect(formatCurrency('39.90')).toBe(`R$${NBSP}39,90`);
  });

  it('o que não é número vira zero', () => {
    // `Number(value) || 0`. Vale notar que isso esconde o erro em vez de
    // mostrá-lo: um valor inesperado aparece como R$ 0,00 na tela.
    expect(formatCurrency('abc')).toBe(`R$${NBSP}0,00`);
    expect(formatCurrency(NaN)).toBe(`R$${NBSP}0,00`);
  });
});

describe('parseCurrencyInput', () => {
  it('digitar da direita para a esquerda, em centavos', () => {
    // É o comportamento de caixa: "5" são 5 centavos, "50" são 50 centavos,
    // "5000" são cinquenta reais.
    expect(parseCurrencyInput('5')).toBe('0.05');
    expect(parseCurrencyInput('50')).toBe('0.50');
    expect(parseCurrencyInput('500')).toBe('5.00');
    expect(parseCurrencyInput('5000')).toBe('50.00');
  });

  it('ignora tudo que não é dígito', () => {
    expect(parseCurrencyInput('R$ 1.234,56')).toBe('1234.56');
  });

  it('campo vazio continua vazio — não vira 0,00', () => {
    // Importante: se virasse '0.00', apagar o campo colocaria um desconto de
    // zero em vez de deixar o campo em branco.
    expect(parseCurrencyInput('')).toBe('');
    expect(parseCurrencyInput('abc')).toBe('');
  });
});

describe('parsePercentInput', () => {
  it('porcentagem é digitada direto', () => {
    // "10" são 10%, e não 10 centavos — ao contrário do campo de reais.
    expect(parsePercentInput('10')).toBe('10');
  });

  it('aceita vírgula como separador', () => {
    expect(parsePercentInput('12,5')).toBe('12.5');
  });

  it('limita a duas casas decimais', () => {
    expect(parsePercentInput('12.3456')).toBe('12.34');
  });

  it('nunca passa de 100', () => {
    expect(parsePercentInput('150')).toBe('100');
    expect(parsePercentInput('100.01')).toBe('100');
  });

  it('exatamente 100 passa', () => {
    expect(parsePercentInput('100')).toBe('100');
  });

  it('campo vazio continua vazio', () => {
    expect(parsePercentInput('')).toBe('');
    expect(parsePercentInput('abc')).toBe('');
  });

  it('colapsa vários pontos num só', () => {
    expect(parsePercentInput('1.2.3')).toBe('1.23');
  });
});
