import { describe, expect, it } from 'vitest';

import {
  EXPIRY_WARNING_DAYS,
  expiryStatusOf,
  expiryWarningLimitUTC,
  startOfTodayUTC,
} from '../expiryWindow.js';

/**
 * A comparação de validade por dia de calendário.
 *
 * O bug que este módulo existe para fechar: `setHours(0,0,0,0)` dava meia-noite
 * **local**, enquanto `expiryDate` é guardado em meia-noite **UTC**. Em UTC-3 a
 * diferença de 3 horas punha o produto que vence hoje do lado errado, e o
 * Dashboard o contava como vencido — nos 52 produtos com data.
 *
 * As funções recebem `agora` como parâmetro em vez de chamar `new Date()` por
 * dentro. É o que torna o fuso testável sem relógio falso: dá para afirmar o
 * comportamento em qualquer hora do dia.
 */

/** Uma data como o banco a guarda: meia-noite UTC do dia da embalagem. */
function validade(dia: string) {
  return new Date(`${dia}T00:00:00.000Z`);
}

describe('startOfTodayUTC', () => {
  it('ancora o dia local em meia-noite UTC', () => {
    // 21h do dia 4 em UTC-3 ainda é dia 4 para a loja.
    const agora = new Date('2026-10-05T00:30:00.000Z'); // 21:30 do dia 4 em UTC-3
    const inicio = startOfTodayUTC(agora);

    // Depende do fuso da máquina; o que se afirma é a invariante: hora zerada.
    expect(inicio.getUTCHours()).toBe(0);
    expect(inicio.getUTCMinutes()).toBe(0);
    expect(inicio.getUTCSeconds()).toBe(0);
    expect(inicio.getUTCMilliseconds()).toBe(0);
  });

  it('usa o dia do calendário local', () => {
    const agora = new Date(2026, 9, 4, 23, 59); // 4 de outubro, hora local
    const inicio = startOfTodayUTC(agora);

    expect(inicio.getUTCFullYear()).toBe(2026);
    expect(inicio.getUTCMonth()).toBe(9);
    expect(inicio.getUTCDate()).toBe(4);
  });
});

describe('expiryWarningLimitUTC', () => {
  it('fica 90 dias à frente de hoje', () => {
    const agora = new Date(2026, 0, 1, 12, 0);
    const dias = (expiryWarningLimitUTC(agora).getTime() - startOfTodayUTC(agora).getTime()) / 86_400_000;

    expect(dias).toBe(EXPIRY_WARNING_DAYS);
  });
});

describe('expiryStatusOf', () => {
  // Meio-dia local do dia 4 de outubro de 2026.
  const agora = new Date(2026, 9, 4, 12, 0);

  it('sem data é "none"', () => {
    expect(expiryStatusOf(null, agora)).toBe('none');
  });

  it('o que vence HOJE não está vencido', () => {
    // O caso exato do bug. Antes da correção isto era 'expired'.
    expect(expiryStatusOf(validade('2026-10-04'), agora)).toBe('soon');
  });

  it('o que venceu ontem está vencido', () => {
    expect(expiryStatusOf(validade('2026-10-03'), agora)).toBe('expired');
  });

  it('não depende da hora do dia', () => {
    // A classificação de um produto não pode mudar porque a tela foi aberta de
    // manhã ou à noite.
    const horas = [0, 3, 12, 21, 23];
    const resultados = horas.map(h => expiryStatusOf(validade('2026-10-04'), new Date(2026, 9, 4, h, 30)));

    expect(new Set(resultados).size).toBe(1);
    expect(resultados[0]).toBe('soon');
  });

  it('dentro da janela é "soon"', () => {
    expect(expiryStatusOf(validade('2026-11-15'), agora)).toBe('soon');
  });

  it('exatamente no último dia da janela ainda é "soon"', () => {
    const limite = expiryWarningLimitUTC(agora);
    expect(expiryStatusOf(limite, agora)).toBe('soon');
  });

  it('um dia além da janela é "ok"', () => {
    const alem = expiryWarningLimitUTC(agora);
    alem.setUTCDate(alem.getUTCDate() + 1);
    expect(expiryStatusOf(alem, agora)).toBe('ok');
  });

  it('data distante é "ok"', () => {
    expect(expiryStatusOf(validade('2028-01-01'), agora)).toBe('ok');
  });
});
