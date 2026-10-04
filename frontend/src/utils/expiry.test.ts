import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXPIRY_WARNING_DAYS, formatExpiryDate, getExpiryStatus } from './expiry';

/**
 * O selo de validade no estoque. 52 produtos no banco têm data, então este é um
 * dos poucos caminhos que o dado real exercita de fato.
 *
 * A comparação é por dia, não por instante: ambos os lados zeram as horas. Sem
 * isso, um produto que vence hoje apareceria como vencido ou não dependendo da
 * hora em que a tela fosse aberta.
 */

describe('getExpiryStatus', () => {
  afterEach(() => { vi.useRealTimers(); });

  function hoje(dia: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${dia}T15:30:00`));
  }

  it('sem data é "none"', () => {
    expect(getExpiryStatus(null)).toBe('none');
    expect(getExpiryStatus(undefined)).toBe('none');
    expect(getExpiryStatus('')).toBe('none');
  });

  it('data passada é "expired"', () => {
    hoje('2026-06-15');
    expect(getExpiryStatus('2026-06-14')).toBe('expired');
  });

  it('vence hoje ainda não está vencido', () => {
    // A tarde de hoje não torna o produto vencido: quem vence hoje ainda pode
    // ser vendido hoje.
    hoje('2026-06-15');
    expect(getExpiryStatus('2026-06-15')).toBe('soon');
  });

  it('dentro da janela de aviso é "soon"', () => {
    hoje('2026-06-15');
    expect(getExpiryStatus('2026-07-01')).toBe('soon');
  });

  it('exatamente no último dia da janela ainda é "soon"', () => {
    hoje('2026-06-15');
    const limite = new Date('2026-06-15');
    limite.setDate(limite.getDate() + EXPIRY_WARNING_DAYS);
    expect(getExpiryStatus(limite.toISOString().slice(0, 10))).toBe('soon');
  });

  it('um dia além da janela é "ok"', () => {
    hoje('2026-06-15');
    const alem = new Date('2026-06-15');
    alem.setDate(alem.getDate() + EXPIRY_WARNING_DAYS + 1);
    expect(getExpiryStatus(alem.toISOString().slice(0, 10))).toBe('ok');
  });

  it('a janela é de 90 dias', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(90);
  });

  it('lê a data de calendário, não o instante UTC', () => {
    // O bug que estes testes encontraram: a API serializa
    // `2026-04-06T00:00:00.000Z`, e em UTC-3 `new Date()` disso caía no dia 5.
    // A validade não tem hora — o que vale é o dia escrito na embalagem.
    hoje('2026-04-06');
    expect(getExpiryStatus('2026-04-06T00:00:00.000Z')).toBe('soon');
    expect(getExpiryStatus('2026-04-05T00:00:00.000Z')).toBe('expired');
  });

  it('data mal formada é tratada como ausente, não como 1970', () => {
    expect(getExpiryStatus('não é data')).toBe('none');
  });
});

describe('formatExpiryDate', () => {
  it('mostra o dia que está no banco, não o anterior', () => {
    // Era aqui que 52 produtos apareciam com a data errada na tela.
    expect(formatExpiryDate('2026-04-06T00:00:00.000Z')).toBe('06/04/2026');
    expect(formatExpiryDate('2026-05-31T00:00:00.000Z')).toBe('31/05/2026');
  });

  it('data mal formada não vira 31/12/1969', () => {
    expect(formatExpiryDate('')).toBe('—');
  });
});
