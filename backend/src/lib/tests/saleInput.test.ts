import { describe, expect, it } from 'vitest';

import { installmentPlansSchema } from '../pricingRules.js';
import { parseSaleCreate, parseSalesQuery, parseSalesReportQuery, subtotalSchema } from '../saleInput.js';
import { parseWith } from '../validate.js';

const items = [{ productId: 1, quantity: 2 }];
const erro = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

describe('parseSaleCreate', () => {
  it('venda à vista, sem cliente, é o padrão', () => {
    expect(parseSaleCreate({ items })).toEqual({
      ok: true,
      data: { customerId: null, items, observation: null, discount: 0, paymentType: 'VISTA', installmentsCount: 1 },
    });
  });

  it('o carrinho vazio é dito como venda, não como carrinho', () => {
    expect(erro(parseSaleCreate({ items: [] }))).toBe('A venda precisa ter pelo menos um item.');
    expect(erro(parseSaleCreate({}))).toBe('A venda precisa ter pelo menos um item.');
  });

  it('cliente: ausente é venda sem cliente; presente e inválido é erro, não NaN no Prisma', () => {
    for (const vazio of [undefined, null, '']) expect(parseSaleCreate({ items, customerId: vazio })).toMatchObject({ data: { customerId: null } });
    expect(parseSaleCreate({ items, customerId: '7' })).toMatchObject({ data: { customerId: 7 } });

    for (const customerId of ['abc', 0, -2, 1.5]) {
      expect(erro(parseSaleCreate({ items, customerId }))).toBe('Cliente inválido.');
    }
  });

  it('a prazo valida as parcelas; à vista as ignora', () => {
    expect(parseSaleCreate({ items, paymentType: 'PRAZO', installmentsCount: 3 })).toMatchObject({ data: { installmentsCount: 3 } });
    expect(parseSaleCreate({ items, paymentType: 'VISTA', installmentsCount: 3 })).toMatchObject({ data: { installmentsCount: 1 } });

    for (const installmentsCount of [0, -1, 0.5, 13, 'x']) {
      expect(erro(parseSaleCreate({ items, paymentType: 'PRAZO', installmentsCount }))).toBe('O parcelamento precisa ser de 1x a 12x.');
    }
  });

  it('PRZO não vira à vista: uma venda fiada registrada como paga some da lista de dívidas', () => {
    expect(erro(parseSaleCreate({ items, paymentType: 'PRZO' }))).toBe('Forma de pagamento inválida.');
  });

  it('desconto digitado e observação aparada', () => {
    expect(parseSaleCreate({ items, discount: '5', observation: ' brinde ' })).toMatchObject({ data: { discount: 5, observation: 'brinde' } });
    expect(parseSaleCreate({ items, discount: 'abc' })).toMatchObject({ data: { discount: 0 } });
  });

  it('o preço que vem no item é descartado: quem define é o produto no banco', () => {
    const r = parseSaleCreate({ items: [{ productId: 1, quantity: 1, unitPrice: 0.01 }] });
    expect(r.ok && r.data.items[0]).toEqual({ productId: 1, quantity: 1 });
  });
});

describe('parseSalesQuery', () => {
  it('sem filtro: sem datas nem cliente, 50 por página', () => {
    expect(parseSalesQuery({})).toEqual({ ok: true, data: { from: undefined, to: undefined, customerId: null, limit: 50 } });
  });

  it('o limite acima do teto é cortado em 200; estranho vale o padrão', () => {
    expect(parseSalesQuery({ limit: '10' })).toMatchObject({ data: { limit: 10 } });
    expect(parseSalesQuery({ limit: '9999' })).toMatchObject({ data: { limit: 200 } });
    for (const limit of ['abc', '0', '', undefined]) expect(parseSalesQuery({ limit })).toMatchObject({ data: { limit: 50 } });
  });

  it('as datas viram Date; data inválida é recusada com a mesma mensagem nas duas pontas', () => {
    const r = parseSalesQuery({ from: '2026-03-01', to: '2026-03-31' });
    expect(r.ok && r.data.from).toBeInstanceOf(Date);
    expect(erro(parseSalesQuery({ from: 'ontem' }))).toBe('Período inválido.');
    expect(erro(parseSalesQuery({ to: 'amanhã' }))).toBe('Período inválido.');
  });

  it('cliente do filtro: inteiro positivo', () => {
    expect(parseSalesQuery({ customerId: '4' })).toMatchObject({ data: { customerId: 4 } });
    expect(erro(parseSalesQuery({ customerId: 'abc' }))).toBe('Cliente inválido.');
  });
});

describe('parseSalesReportQuery', () => {
  it('exige o início do período', () => {
    for (const from of [undefined, '', null]) {
      expect(erro(parseSalesReportQuery({ from }))).toBe('Informe a data inicial do período.');
    }
    expect(erro(parseSalesReportQuery({}))).toBe('Informe a data inicial do período.');
  });

  it('data inválida tem mensagem própria', () => {
    expect(erro(parseSalesReportQuery({ from: 'ontem' }))).toBe('Data inicial inválida.');
  });

  it('aceita uma data ISO', () => {
    const r = parseSalesReportQuery({ from: '2026-01-01T00:00:00.000Z' });
    expect(r.ok && r.data.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('subtotalSchema', () => {
  it('número vale o número; negativo, texto e não-finito valem 0 — e nunca lança', () => {
    expect(subtotalSchema.parse('99.9')).toBe(99.9);
    for (const ruim of [-5, 'abc', undefined, null, NaN, Infinity, -Infinity]) {
      expect(subtotalSchema.parse(ruim)).toBe(0);
    }
  });
});

describe('installmentPlansSchema', () => {
  const plano = (installments: number, interestPercent = 0, extra: object = {}) => ({ installments, interestPercent, ...extra });

  it('lê a tabela inteira, com ativo por padrão', () => {
    expect(parseWith(installmentPlansSchema, { plans: [plano(2), plano(3, 5, { active: false })] })).toEqual({
      ok: true,
      data: { plans: [
        { installments: 2, interestPercent: 0, active: true },
        { installments: 3, interestPercent: 5, active: false },
      ] },
    });
  });

  it('exige a lista', () => {
    for (const corpo of [{}, { plans: [] }, { plans: 'x' }, undefined]) {
      expect(erro(parseWith(installmentPlansSchema, corpo))).toBe('Envie as opções de parcelamento.');
    }
  });

  it('a faixa fica entre 2x e 12x, inteira', () => {
    for (const installments of [1, 13, 0, 2.5, 'x']) {
      expect(erro(parseWith(installmentPlansSchema, { plans: [plano(installments as number)] })))
        .toBe('O parcelamento precisa ser entre 2x e 12x.');
    }
  });

  it('a taxa fica entre 0% e 100%', () => {
    for (const interestPercent of [-1, 100.5, 'abc']) {
      expect(erro(parseWith(installmentPlansSchema, { plans: [plano(2, interestPercent as number)] })))
        .toBe('A taxa de juros precisa ficar entre 0% e 100%.');
    }
    expect(parseWith(installmentPlansSchema, { plans: [plano(2, 100)] }).ok).toBe(true);
  });

  it('a mesma faixa duas vezes é recusada, dizendo qual', () => {
    expect(erro(parseWith(installmentPlansSchema, { plans: [plano(3), plano(4), plano(3)] }))).toBe('3x aparece duas vezes.');
  });
});
