import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildInstallments } from './sales.js';

/**
 * A divisão em centavos.
 *
 * 10,00 em 3x daria 3,3333… e a soma das parcelas não fecharia com o total.
 * A regra é somar sempre: o resto vai para as primeiras parcelas.
 */

function somaDe(parcelas: Array<{ value: number }>) {
  // Em centavos, porque somar os Float de volta reintroduz justamente a sobra
  // que a função existe para eliminar.
  return parcelas.reduce((acc, p) => acc + Math.round(p.value * 100), 0);
}

describe('buildInstallments — valores', () => {
  it('distribui a sobra nas primeiras parcelas', () => {
    const parcelas = buildInstallments(10, 3, false);
    expect(parcelas.map(p => p.value)).toEqual([3.34, 3.33, 3.33]);
    expect(somaDe(parcelas)).toBe(1000);
  });

  it('divisão exata não deixa sobra', () => {
    expect(buildInstallments(100, 4, false).map(p => p.value)).toEqual([25, 25, 25, 25]);
  });

  it('numera as parcelas de 1 a n', () => {
    expect(buildInstallments(90, 3, false).map(p => p.number)).toEqual([1, 2, 3]);
  });

  it('parcela única é o total inteiro', () => {
    expect(buildInstallments(78.89, 1, true).map(p => p.value)).toEqual([78.89]);
  });

  it('a soma das parcelas fecha com o total — para qualquer total e parcelamento', () => {
    // A propriedade que importa de verdade. Vale mais que qualquer caso
    // escolhido a dedo, porque é a invariante que a loja depende.
    for (let centavos = 1; centavos <= 2000; centavos += 7) {
      const total = centavos / 100;
      for (let n = 1; n <= 12; n++) {
        expect(somaDe(buildInstallments(total, n, false))).toBe(centavos);
      }
    }
  });

  it('nenhuma parcela difere da outra em mais de um centavo', () => {
    for (let n = 2; n <= 12; n++) {
      const valores = buildInstallments(99.99, n, false).map(p => Math.round(p.value * 100));
      expect(Math.max(...valores) - Math.min(...valores)).toBeLessThanOrEqual(1);
    }
  });

  it('funciona com total que já carrega juros — quando ele deixa de ser redondo', () => {
    const parcelas = buildInstallments(102.37, 7, false);
    expect(somaDe(parcelas)).toBe(10237);
  });
});

describe('buildInstallments — datas', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('à vista: vence hoje e já nasce paga', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

    const [parcela] = buildInstallments(50, 1, true);

    expect(parcela?.paidAt).toEqual(new Date('2026-03-10T12:00:00Z'));
    expect(parcela?.dueDate).toEqual(new Date('2026-03-10T12:00:00Z'));
  });

  it('a prazo: uma parcela por mês, nenhuma paga', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

    const parcelas = buildInstallments(300, 3, false);

    expect(parcelas.map(p => p.paidAt)).toEqual([null, null, null]);
    expect(parcelas.map(p => p.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-04-10', '2026-05-10', '2026-06-10',
    ]);
  });

  it('vira o ano corretamente', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));

    const parcelas = buildInstallments(300, 3, false);
    expect(parcelas.map(p => p.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-12-15', '2027-01-15', '2027-02-15',
    ]);
  });

  it('dia 31: o mês curto transborda para o mês seguinte', () => {
    // Comportamento atual, não escolha deliberada: `setMonth` em 31/01 cai em
    // 03/03, porque 31/02 não existe e o JS transborda. Documentado aqui para
    // que uma mudança nisso seja uma decisão, e não um acidente.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));

    const parcelas = buildInstallments(200, 2, false);
    expect(parcelas.map(p => p.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-03-03', '2026-03-31',
    ]);
  });
});
