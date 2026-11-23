import { Prisma } from '@prisma/client';

/**
 * Dinheiro no banco é **centavos inteiros**; no código continua sendo reais.
 *
 * `Float` guarda 0,1 + 0,2 como 0,30000000000000004: a soma das parcelas deixa de
 * bater com o total por um centavo, e o `SUM` do banco acumula o erro. Um inteiro
 * não tem esse problema. Esta extensão do Prisma é a fronteira: converte reais em
 * centavos na escrita e centavos em reais na leitura, para o resto do código — e o
 * frontend — seguir falando em reais, sem uma conversão espalhada por cada consulta.
 *
 * Os tipos do TypeScript não mudam: `Int` e `Float` são `number`. Por isso a
 * conversão é inteira aqui, e o que **não** passa por ela é dito abaixo.
 *
 * O que a extensão cobre: escrita (`data`, inclusive aninhada em `create`, `update`,
 * `upsert`, `createMany`), filtro (`where`, com `gt`, `in`, `not`…) e leitura
 * (resultado, inclusive em `include` e nos `_sum`/`_avg`/`_min`/`_max` de
 * `aggregate` e `groupBy`).
 *
 * O que **não** cobre: `$queryRaw` / `$executeRaw` — SQL escrito à mão vê centavos e
 * converte por conta própria (hoje, só a dívida em `customers.controller`).
 */

/**
 * As colunas em centavos, por modelo.
 *
 * `Coupon.value` entra porque é percentual *ou* valor fixo, na mesma coluna: ambos
 * guardados em centésimos (10% = 1000, R$ 5,00 = 500), a mesma conversão por 100.
 *
 * Ficam de fora, de propósito, o que não é dinheiro transacionado:
 * `Product.averageCost` (uma média ponderada, que pode ter fração de centavo —
 * arredondá-la a cada reabastecimento distorceria o lucro) e
 * `InstallmentPlan.interestPercent` (uma taxa).
 */
export const MONEY_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  Product: ['sellingPrice', 'promotionalPrice'],
  Sale: ['total', 'discount', 'interest'],
  SaleItem: ['unitPrice'],
  OrderItem: ['unitPrice'],
  Installment: ['value'],
  Coupon: ['value', 'minimumTotal'],
};

/** Reais → centavos. O `toPrecision` desfaz o ruído do ponto flutuante (1,005 × 100). */
export function reaisToCents(reais: number): number {
  if (!Number.isFinite(reais)) {
    throw new Error(`Valor monetário inválido: ${reais}`);
  }

  return Math.round(Number((reais * 100).toPrecision(15)));
}

export function centsToReais(cents: number): number {
  return cents / 100;
}

type ModelMeta = { money: ReadonlySet<string>; relations: ReadonlyMap<string, string> };
export type SchemaMeta = ReadonlyMap<string, ModelMeta>;

type DmmfModel = { name: string; fields: ReadonlyArray<{ name: string; kind: string; type: string }> };

/** As relações vêm do próprio schema (`Prisma.dmmf`): nada a manter em duplicata. */
export function buildSchemaMeta(
  models: readonly DmmfModel[],
  columns: Readonly<Record<string, readonly string[]>> = MONEY_COLUMNS
): SchemaMeta {
  return new Map(models.map(model => [model.name, {
    money: new Set(columns[model.name] ?? []),
    relations: new Map(model.fields.filter(f => f.kind === 'object').map(f => [f.name, f.type] as const)),
  }]));
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * O que se escreve ou filtra num campo em centavos: um número, ou um operador
 * (`{ gt: 10 }`, `{ in: [1, 2] }`, `{ not: { lt: 5 } }`, `{ increment: 3 }`).
 * `multiply` e `divide` não têm conversão correta (multiplicar por 2 não é
 * multiplicar centavos por 200) e não existem hoje: recusados em vez de errar.
 */
function operandToCents(operand: unknown): unknown {
  if (typeof operand === 'number') return reaisToCents(operand);
  if (Array.isArray(operand)) return operand.map(operandToCents);

  if (isPlainObject(operand)) {
    return Object.fromEntries(Object.entries(operand).map(([key, value]) => {
      if (key === 'multiply' || key === 'divide') {
        throw new Error(`A operação "${key}" não é suportada em campo monetário.`);
      }
      return [key, operandToCents(value)];
    }));
  }

  return operand;
}

/**
 * Converte os argumentos de uma consulta, descendo pelas relações. Chave que não é
 * campo do modelo (`data`, `where`, `create`, `OR`, `orderBy`…) é um invólucro: o
 * conteúdo continua sendo do mesmo modelo. Booleanos e textos passam como estão
 * (`select: { total: true }`, `orderBy: { total: 'desc' }`).
 */
export function argsToCents(meta: SchemaMeta, model: string, node: unknown): unknown {
  if (Array.isArray(node)) return node.map(item => argsToCents(meta, model, item));
  if (!isPlainObject(node)) return node;

  const info = meta.get(model);

  return Object.fromEntries(Object.entries(node).map(([key, value]) => {
    if (info?.money.has(key)) return [key, operandToCents(value)];

    const target = info?.relations.get(key);
    return [key, argsToCents(meta, target ?? model, value)];
  }));
}

/** Converte o resultado, descendo pelas relações e pelos `_sum`/`_avg`/`_min`/`_max`. */
export function resultToReais(meta: SchemaMeta, model: string, node: unknown): unknown {
  if (Array.isArray(node)) return node.map(item => resultToReais(meta, model, item));
  if (!isPlainObject(node)) return node;

  const info = meta.get(model);

  return Object.fromEntries(Object.entries(node).map(([key, value]) => {
    // `_count` conta linhas: não é dinheiro, mesmo que o campo contado seja.
    if (key === '_count') return [key, value];

    if (info?.money.has(key)) return [key, typeof value === 'number' ? centsToReais(value) : value];

    const target = info?.relations.get(key);
    return [key, resultToReais(meta, target ?? model, value)];
  }));
}

/** A extensão: toda consulta entra em reais, vai ao banco em centavos e volta em reais. */
export function createMoneyExtension(meta: SchemaMeta) {
  return Prisma.defineExtension({
    name: 'money-in-cents',
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          return resultToReais(meta, model, await query(argsToCents(meta, model, args) as typeof args));
        },
      },
    },
  });
}

export const moneyExtension = createMoneyExtension(
  buildSchemaMeta((Prisma as unknown as { dmmf: { datamodel: { models: DmmfModel[] } } }).dmmf.datamodel.models)
);
