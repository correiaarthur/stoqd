import { describe, expect, it } from 'vitest';

import {
  computeTotals,
  getInterestPercent,
  lineTotal,
  previewInstallmentValue,
  sumLines,
  toCents,
} from './pricingRules.js';

/**
 * Esta é a conta que decide quanto o cliente paga.
 *
 * O dado real não exercita nenhuma destas regras: das nove vendas no banco,
 * zero têm desconto e zero têm juros. Os caminhos abaixo nunca rodaram em
 * produção, o que é exatamente o motivo de existirem aqui.
 */

describe('toCents', () => {
  it('arredonda para o centavo', () => {
    expect(toCents(10.994)).toBe(10.99);
    expect(toCents(10.995)).toBe(11);
    expect(toCents(0.1 + 0.2)).toBe(0.3);
  });

  it('absorve a sobra que a multiplicação de Float deixa', () => {
    // 19.99 * 3 = 59.96999999999999 em Float.
    expect(toCents(19.99 * 3)).toBe(59.97);
  });
});

describe('lineTotal', () => {
  it('multiplica preço por quantidade', () => {
    expect(lineTotal({ unitPrice: 12.5, quantity: 4 })).toBe(50);
  });

  it('não arredonda — quem fecha a conta é computeTotals', () => {
    // Documenta a divisão de responsabilidade: se lineTotal arredondasse,
    // arredondaria linha por linha e o total mudaria.
    expect(lineTotal({ unitPrice: 19.99, quantity: 3 })).toBe(19.99 * 3);
  });
});

describe('sumLines', () => {
  it('soma as linhas', () => {
    expect(sumLines([
      { unitPrice: 10, quantity: 2 },
      { unitPrice: 5.5, quantity: 1 },
    ])).toBe(25.5);
  });

  it('carrinho vazio é zero, não erro', () => {
    expect(sumLines([])).toBe(0);
  });

  it('soma na ordem dos itens', () => {
    // Soma de Float não é associativa. Se algum dia a implementação ordenar os
    // itens antes de somar, o centavo pode mudar — e este teste avisa.
    const linhas = [
      { unitPrice: 0.1, quantity: 1 },
      { unitPrice: 0.2, quantity: 1 },
      { unitPrice: 0.3, quantity: 1 },
    ];
    expect(sumLines(linhas)).toBe(0.1 + 0.2 + 0.3);
  });
});

describe('computeTotals', () => {
  it('sem desconto e sem juros, o total é o bruto', () => {
    expect(computeTotals({ grossTotal: 100, discount: 0, interestPercent: 0 })).toEqual({
      grossTotal: 100,
      discount: 0,
      netTotal: 100,
      interest: 0,
      finalTotal: 100,
    });
  });

  it('desconta do bruto', () => {
    const t = computeTotals({ grossTotal: 100, discount: 10, interestPercent: 0 });
    expect(t.netTotal).toBe(90);
    expect(t.finalTotal).toBe(90);
  });

  it('cobra juros sobre o líquido, nunca sobre o bruto', () => {
    // A regra documentada no topo do módulo: cobrar juros sobre um valor que
    // foi descontado é cobrar por dinheiro que a loja nunca emprestou.
    // Sobre o bruto os juros seriam 10,00; sobre o líquido são 5,00.
    const t = computeTotals({ grossTotal: 100, discount: 50, interestPercent: 10 });
    expect(t.netTotal).toBe(50);
    expect(t.interest).toBe(5);
    expect(t.finalTotal).toBe(55);
  });

  it('limita o desconto ao bruto — a loja não paga para vender', () => {
    const t = computeTotals({ grossTotal: 100, discount: 150, interestPercent: 0 });
    expect(t.discount).toBe(100);
    expect(t.netTotal).toBe(0);
    expect(t.finalTotal).toBe(0);
  });

  it('desconto negativo vira zero', () => {
    const t = computeTotals({ grossTotal: 100, discount: -20, interestPercent: 0 });
    expect(t.discount).toBe(0);
    expect(t.finalTotal).toBe(100);
  });

  it('arredonda os juros para o centavo', () => {
    const t = computeTotals({ grossTotal: 10, discount: 0, interestPercent: 3.33 });
    expect(t.interest).toBe(0.33);
    expect(t.finalTotal).toBe(10.33);
  });

  it('o bruto também sai arredondado', () => {
    const t = computeTotals({ grossTotal: 19.99 * 3, discount: 0, interestPercent: 0 });
    expect(t.grossTotal).toBe(59.97);
    expect(t.finalTotal).toBe(59.97);
  });

  it('desconto zerando o líquido não gera juros', () => {
    const t = computeTotals({ grossTotal: 80, discount: 80, interestPercent: 12 });
    expect(t.interest).toBe(0);
    expect(t.finalTotal).toBe(0);
  });
});

describe('previewInstallmentValue', () => {
  it('divide o total pelas parcelas, arredondado', () => {
    expect(previewInstallmentValue(100, 3)).toBe(33.33);
  });
});

describe('getInterestPercent', () => {
  /** Client falso: só o `installmentPlan.findUnique` interessa. */
  function clientCom(plano: { installments: number; interestPercent: number; active: boolean } | null) {
    return {
      installmentPlan: {
        findUnique: async () => plano,
      },
    } as never;
  }

  it('1x e à vista são sempre 0% — sem consultar o banco', async () => {
    const explode = {
      installmentPlan: {
        findUnique: () => { throw new Error('não deveria consultar o banco'); },
      },
    } as never;

    expect(await getInterestPercent(explode, 1)).toBe(0);
    expect(await getInterestPercent(explode, 0)).toBe(0);
  });

  it('devolve a taxa do plano ativo', async () => {
    const client = clientCom({ installments: 4, interestPercent: 2, active: true });
    expect(await getInterestPercent(client, 4)).toBe(2);
  });

  it('plano desligado devolve null, e não 0%', async () => {
    // A diferença importa: 0% faria desligar um parcelamento virar desconto
    // silencioso. `null` obriga a venda a recusar.
    const client = clientCom({ installments: 6, interestPercent: 6, active: false });
    expect(await getInterestPercent(client, 6)).toBeNull();
  });

  it('plano inexistente devolve null', async () => {
    expect(await getInterestPercent(clientCom(null), 7)).toBeNull();
  });
});
