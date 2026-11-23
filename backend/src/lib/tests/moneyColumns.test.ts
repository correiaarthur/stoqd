import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  MONEY_COLUMNS,
  argsToCents,
  buildSchemaMeta,
  centsToReais,
  reaisToCents,
  resultToReais,
} from '../moneyColumns.js';

/**
 * A fronteira entre reais (o código) e centavos (o banco). Funções puras sobre o
 * schema de verdade: sem banco.
 */

const dmmf = (Prisma as unknown as { dmmf: { datamodel: { models: Array<{ name: string; fields: Array<{ name: string; kind: string; type: string }> }> } } }).dmmf.datamodel.models;
const meta = buildSchemaMeta(dmmf);

describe('reaisToCents', () => {
  it.each([
    [0, 0], [1, 100], [59.9, 5990], [19.99, 1999], [0.1 + 0.2, 30], [1234567.89, 123456789], [-5.5, -550],
  ])('%s reais = %s centavos', (reais, cents) => {
    expect(reaisToCents(reais)).toBe(cents);
  });

  it('desfaz o ruído do ponto flutuante: 1,005 × 100 dá 100,49999… e vale 101', () => {
    expect(1.005 * 100).toBeLessThan(100.5);
    expect(reaisToCents(1.005)).toBe(101);
  });

  it('sempre devolve um inteiro', () => {
    for (const reais of [0.1, 0.7, 4.35, 8.2, 33.33, 99.995]) {
      expect(Number.isInteger(reaisToCents(reais))).toBe(true);
    }
  });

  it('NaN e infinito são recusados — o Prisma receberia um inteiro inválido', () => {
    for (const ruim of [NaN, Infinity, -Infinity]) expect(() => reaisToCents(ruim)).toThrow(/inválido/);
  });
});

describe('centsToReais', () => {
  it('é a divisão por 100, e ida e volta não perde nada', () => {
    expect(centsToReais(5990)).toBe(59.9);

    for (let cents = 0; cents <= 100000; cents += 7) {
      expect(reaisToCents(centsToReais(cents))).toBe(cents);
    }
  });
});

describe('argsToCents — escrita', () => {
  it('converte os campos monetários do próprio modelo e deixa o resto', () => {
    expect(argsToCents(meta, 'Product', { data: { name: 'Sabonete', quantity: 7, sellingPrice: 59.9, promotionalPrice: 49.9 } }))
      .toEqual({ data: { name: 'Sabonete', quantity: 7, sellingPrice: 5990, promotionalPrice: 4990 } });
  });

  it('não converte o que não é dinheiro: custo médio e taxa de juros ficam como estão', () => {
    expect(argsToCents(meta, 'Product', { data: { averageCost: 12.3333 } })).toEqual({ data: { averageCost: 12.3333 } });
    expect(argsToCents(meta, 'InstallmentPlan', { data: { installments: 3, interestPercent: 4.5 } }))
      .toEqual({ data: { installments: 3, interestPercent: 4.5 } });
  });

  it('desce pelas relações: a venda com itens e parcelas criados juntos', () => {
    const args = {
      data: {
        total: 90, discount: 10, interest: 0, customerId: 3,
        items: { create: [{ productId: 1, quantity: 2, unitPrice: 50 }] },
        installments: { create: [{ number: 1, value: 45.5, dueDate: new Date(0) }, { number: 2, value: 44.5, dueDate: new Date(0) }] },
      },
    };

    const convertido = argsToCents(meta, 'Sale', args) as typeof args;

    expect(convertido.data).toMatchObject({ total: 9000, discount: 1000, interest: 0, customerId: 3 });
    expect(convertido.data.items.create[0]).toEqual({ productId: 1, quantity: 2, unitPrice: 5000 });
    expect(convertido.data.installments.create.map(i => i.value)).toEqual([4550, 4450]);
    expect(convertido.data.installments.create[0]!.dueDate).toEqual(new Date(0));
  });

  it('cobre `createMany`, `update`, `upsert` e `connectOrCreate`', () => {
    expect(argsToCents(meta, 'SaleItem', { data: [{ unitPrice: 1.5 }, { unitPrice: 2.25 }] }))
      .toEqual({ data: [{ unitPrice: 150 }, { unitPrice: 225 }] });

    expect(argsToCents(meta, 'Coupon', { where: { id: 1 }, data: { value: 12.5, minimumTotal: 80 } }))
      .toEqual({ where: { id: 1 }, data: { value: 1250, minimumTotal: 8000 } });

    expect(argsToCents(meta, 'Product', { where: { id: 1 }, create: { sellingPrice: 10 }, update: { sellingPrice: 11 } }))
      .toEqual({ where: { id: 1 }, create: { sellingPrice: 1000 }, update: { sellingPrice: 1100 } });

    const nested = argsToCents(meta, 'Order', {
      data: { userId: 1, items: { connectOrCreate: { where: { id: 1 }, create: { productId: 1, quantity: 1, unitPrice: 9.9 } } } },
    }) as { data: { items: { connectOrCreate: { create: { unitPrice: number } } } } };
    expect(nested.data.items.connectOrCreate.create.unitPrice).toBe(990);
  });

  it('o percentual do cupom e o valor fixo usam a mesma conversão (centésimos)', () => {
    expect(argsToCents(meta, 'Coupon', { data: { type: 'PERCENT', value: 10 } })).toEqual({ data: { type: 'PERCENT', value: 1000 } });
    expect(argsToCents(meta, 'Coupon', { data: { type: 'FIXED', value: 5 } })).toEqual({ data: { type: 'FIXED', value: 500 } });
  });

  it('operadores de filtro: gt, gte, lt, in, notIn, not, equals', () => {
    expect(argsToCents(meta, 'Product', {
      where: { promotionalPrice: { not: null, gt: 0 }, sellingPrice: { gte: 10.5, lt: 99.99, in: [1, 2.5], not: { equals: 3 } } },
    })).toEqual({
      where: { promotionalPrice: { not: null, gt: 0 }, sellingPrice: { gte: 1050, lt: 9999, in: [100, 250], not: { equals: 300 } } },
    });
  });

  it('operadores de escrita: set e increment/decrement', () => {
    expect(argsToCents(meta, 'Sale', { data: { total: { set: 10 }, discount: { increment: 2.5 } } }))
      .toEqual({ data: { total: { set: 1000 }, discount: { increment: 250 } } });
  });

  it('multiply e divide em campo monetário são recusados, em vez de errar o valor', () => {
    expect(() => argsToCents(meta, 'Sale', { data: { total: { multiply: 2 } } })).toThrow(/multiply/);
    expect(() => argsToCents(meta, 'Sale', { data: { total: { divide: 2 } } })).toThrow(/divide/);
  });

  it('filtro por campo de outro tipo no meio de AND/OR continua do mesmo modelo', () => {
    expect(argsToCents(meta, 'Sale', { where: { OR: [{ total: { gt: 5 } }, { AND: [{ discount: 1 }] }], customerId: 4 } }))
      .toEqual({ where: { OR: [{ total: { gt: 500 } }, { AND: [{ discount: 100 }] }], customerId: 4 } });
  });

  it('seleção, ordem, paginação e booleanos passam como estão', () => {
    const args = { select: { total: true, items: { select: { unitPrice: true } } }, orderBy: { total: 'desc' }, take: 10, skip: 5, cursor: { id: 3 } };
    expect(argsToCents(meta, 'Sale', args)).toEqual(args);
    expect(argsToCents(meta, 'Sale', { _sum: { total: true }, by: ['customerId'] })).toEqual({ _sum: { total: true }, by: ['customerId'] });
  });

  it('null e undefined num campo monetário opcional ficam como estão', () => {
    expect(argsToCents(meta, 'Product', { data: { promotionalPrice: null } })).toEqual({ data: { promotionalPrice: null } });
    expect(argsToCents(meta, 'Sale', { data: { discount: undefined } })).toEqual({ data: { discount: undefined } });
  });

  it('não altera o objeto de quem chamou', () => {
    const args = { data: { sellingPrice: 10 } };
    argsToCents(meta, 'Product', args);
    expect(args).toEqual({ data: { sellingPrice: 10 } });
  });

  it('argumento vazio ou não objeto passa como está', () => {
    expect(argsToCents(meta, 'Sale', undefined)).toBeUndefined();
    expect(argsToCents(meta, 'Sale', {})).toEqual({});
    expect(argsToCents(meta, 'Sale', 5)).toBe(5);
  });
});

describe('resultToReais — leitura', () => {
  it('converte os campos monetários e deixa o resto', () => {
    expect(resultToReais(meta, 'Product', { id: 1, name: 'X', quantity: 4, sellingPrice: 5990, promotionalPrice: null, averageCost: 12.5 }))
      .toEqual({ id: 1, name: 'X', quantity: 4, sellingPrice: 59.9, promotionalPrice: null, averageCost: 12.5 });
  });

  it('desce pelas relações do `include`: venda → itens → produto', () => {
    const venda = {
      id: 1, total: 9000, discount: 1000, interest: null,
      items: [{ id: 1, quantity: 2, unitPrice: 5000, product: { name: 'X', sellingPrice: 5000, promotionalPrice: 4500 } }],
      installments: [{ number: 1, value: 4550 }],
      coupon: { code: 'A', type: 'PERCENT', value: 1000, minimumTotal: null },
    };

    expect(resultToReais(meta, 'Sale', venda)).toEqual({
      id: 1, total: 90, discount: 10, interest: null,
      items: [{ id: 1, quantity: 2, unitPrice: 50, product: { name: 'X', sellingPrice: 50, promotionalPrice: 45 } }],
      installments: [{ number: 1, value: 45.5 }],
      coupon: { code: 'A', type: 'PERCENT', value: 10, minimumTotal: null },
    });
  });

  it('lista de resultados', () => {
    expect(resultToReais(meta, 'Installment', [{ value: 100 }, { value: 250 }])).toEqual([{ value: 1 }, { value: 2.5 }]);
  });

  it('agregações: `_sum`, `_avg`, `_min`, `_max` convertem; `_count` não', () => {
    expect(resultToReais(meta, 'Sale', {
      _sum: { total: 123456 }, _avg: { total: 41152 }, _min: { total: 100 }, _max: { total: 99999 }, _count: { id: 3, total: 3 },
    })).toEqual({
      _sum: { total: 1234.56 }, _avg: { total: 411.52 }, _min: { total: 1 }, _max: { total: 999.99 }, _count: { id: 3, total: 3 },
    });
  });

  it('groupBy: o agrupador fica, a soma converte', () => {
    expect(resultToReais(meta, 'Sale', [{ customerId: 4, _sum: { total: 5000 } }, { customerId: 5, _sum: { total: null } }]))
      .toEqual([{ customerId: 4, _sum: { total: 50 } }, { customerId: 5, _sum: { total: null } }]);
  });

  it('o resultado que não é objeto passa: `count`, `null` (não achou), `{ count }` do updateMany', () => {
    expect(resultToReais(meta, 'Sale', 7)).toBe(7);
    expect(resultToReais(meta, 'Sale', null)).toBeNull();
    expect(resultToReais(meta, 'Sale', { count: 4 })).toEqual({ count: 4 });
  });

  it('datas e outros objetos que não são planos não são tocados', () => {
    const data = new Date('2026-01-01T00:00:00Z');
    expect(resultToReais(meta, 'Sale', { date: data, total: 100 })).toEqual({ date: data, total: 1 });
  });
});

describe('o schema e a lista de colunas monetárias não se separam', () => {
  const campos = (modelo: string) => dmmf.find(m => m.name === modelo)!.fields;

  it('toda coluna listada existe e é inteira no schema', () => {
    for (const [modelo, colunas] of Object.entries(MONEY_COLUMNS)) {
      for (const coluna of colunas) {
        const campo = campos(modelo).find(f => f.name === coluna);
        expect(campo, `${modelo}.${coluna}`).toBeDefined();
        expect(campo!.type, `${modelo}.${coluna} deveria ser Int (centavos)`).toBe('Int');
      }
    }
  });

  it('nenhum `Float` novo entra sem ser decidido: as únicas exceções são o custo médio e a taxa', () => {
    const floats = dmmf.flatMap(m => m.fields.filter(f => f.type === 'Float').map(f => `${m.name}.${f.name}`)).sort();

    expect(floats).toEqual(['InstallmentPlan.interestPercent', 'Product.averageCost']);
  });

  it('as relações vêm do schema: venda → itens, parcelas, cliente e cupom', () => {
    expect(Object.fromEntries(buildSchemaMeta(dmmf).get('Sale')!.relations)).toMatchObject({
      items: 'SaleItem', installments: 'Installment', customer: 'Customer', coupon: 'Coupon',
    });
  });
});
