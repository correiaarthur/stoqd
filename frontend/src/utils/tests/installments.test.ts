import { describe, expect, it } from 'vitest';

import { simulateInstallment } from '../installments';

/**
 * A simulação da tela de Ajustes tem de bater com a venda — que faz a conta no
 * servidor, em centavos. O servidor tem os mesmos números nos testes dele.
 */
describe('simulateInstallment', () => {
  it('sem juros: o total é o valor e a parcela é a divisão', () => {
    expect(simulateInstallment(300, 0, 3)).toEqual({ interest: 0, total: 300, perInstallment: 100 });
  });

  it('com juros: juros sobre o valor, parcela sobre o total', () => {
    expect(simulateInstallment(246.6, 2, 4)).toEqual({ interest: 4.93, total: 251.53, perInstallment: 62.88 });
  });

  it('arredonda em cada passo, em centavos — não só no fim', () => {
    // 100 * 3,33% = 3,33; 103,33 / 3 = 34,4433… → 34,44
    expect(simulateInstallment(100, 3.33, 3)).toEqual({ interest: 3.33, total: 103.33, perInstallment: 34.44 });
  });

  it('valor negativo ou zero não gera juros nem parcela negativa', () => {
    expect(simulateInstallment(-50, 5, 3)).toEqual({ interest: 0, total: 0, perInstallment: 0 });
    expect(simulateInstallment(0, 5, 3).perInstallment).toBe(0);
  });

  it('sem parcelas, a "parcela" é o total', () => {
    expect(simulateInstallment(200, 10, 0).perInstallment).toBe(220);
  });
});
