import { describe, expect, it } from 'vitest';

import {
  getReservedByProduct,
  getStockView,
  reservationExpiry,
  withAvailability,
} from './availability.js';

/**
 * A regra do módulo: **disponível nunca é armazenado, sempre é derivado**.
 *
 * Não existe job liberando reserva vencida; a consulta ignora quem já venceu.
 * Isso é uma decisão de arquitetura que vive dentro de um `where` — e um `where`
 * é fácil de mudar sem perceber. Os testes abaixo prendem a forma dele.
 */

/** Client falso: registra o `where` recebido e devolve o agrupamento pedido. */
function clientGroupBy(linhas: Array<{ productId: number; _sum: { quantity: number | null } }>) {
  const chamadas: Array<Record<string, unknown>> = [];
  const client = {
    reservation: {
      groupBy: async (args: { where: Record<string, unknown> }) => {
        chamadas.push(args.where);
        return linhas;
      },
    },
  } as never;
  return { client, chamadas };
}

describe('reservationExpiry', () => {
  it('soma os minutos ao instante informado', () => {
    const base = new Date('2026-03-10T12:00:00Z');
    expect(reservationExpiry(5, base)).toEqual(new Date('2026-03-10T12:05:00Z'));
    expect(reservationExpiry(30, base)).toEqual(new Date('2026-03-10T12:30:00Z'));
  });
});

describe('getReservedByProduct', () => {
  it('lista vazia não consulta o banco', async () => {
    const explode = {
      reservation: { groupBy: () => { throw new Error('não deveria consultar'); } },
    } as never;

    expect((await getReservedByProduct([], { tx: explode })).size).toBe(0);
  });

  it('só conta reserva ainda válida e não presa a pedido', async () => {
    const { client, chamadas } = clientGroupBy([]);
    await getReservedByProduct([1, 2], { tx: client });

    const where = chamadas[0]!;
    // `orderId: null` é a decisão D2: pedido pendente não segura estoque, o
    // balcão ganha. É por isso que a confirmação revalida e pode recusar.
    expect(where).toMatchObject({ orderId: null });
    expect(where).toHaveProperty('expiresAt');
    expect((where['expiresAt'] as { gt: Date }).gt).toBeInstanceOf(Date);
  });

  it('exclui o próprio carrinho quando pedido', async () => {
    // Sem isso o carrinho do visitante esconderia dele mesmo o que ele acabou
    // de escolher.
    const { client, chamadas } = clientGroupBy([]);
    await getReservedByProduct([1], { tx: client, excludeCartToken: 'abc' });

    expect(chamadas[0]).toMatchObject({ cartToken: { not: 'abc' } });
  });

  it('não filtra por carrinho quando não há token', async () => {
    const { client, chamadas } = clientGroupBy([]);
    await getReservedByProduct([1], { tx: client });

    expect(chamadas[0]).not.toHaveProperty('cartToken');
  });

  it('soma nula vira zero', async () => {
    const { client } = clientGroupBy([{ productId: 1, _sum: { quantity: null } }]);
    expect((await getReservedByProduct([1], { tx: client })).get(1)).toBe(0);
  });
});

describe('getStockView', () => {
  it('disponível é o físico menos o reservado', async () => {
    const { client } = clientGroupBy([{ productId: 1, _sum: { quantity: 2 } }]);
    const view = await getStockView([{ id: 1, quantity: 5 }], { tx: client });

    expect(view.get(1)).toEqual({ productId: 1, quantity: 5, reserved: 2, available: 3 });
  });

  it('produto sem reserva fica com o físico inteiro disponível', async () => {
    const { client } = clientGroupBy([]);
    const view = await getStockView([{ id: 1, quantity: 4 }], { tx: client });

    expect(view.get(1)).toMatchObject({ reserved: 0, available: 4 });
  });

  it('nunca devolve disponível negativo', async () => {
    // O balcão pode ter vendido o que estava reservado, e aí a soma das
    // reservas passa do que há na prateleira.
    const { client } = clientGroupBy([{ productId: 1, _sum: { quantity: 7 } }]);
    const view = await getStockView([{ id: 1, quantity: 2 }], { tx: client });

    expect(view.get(1)).toMatchObject({ quantity: 2, reserved: 7, available: 0 });
  });

  it('mantém o físico intacto mesmo quando o disponível é travado em zero', async () => {
    // Quem atende precisa dos dois números: "1 un · 1 reservada" avisa sem
    // impedir. Se `quantity` também fosse travado, a tela mentiria.
    const { client } = clientGroupBy([{ productId: 1, _sum: { quantity: 9 } }]);
    const view = await getStockView([{ id: 1, quantity: 3 }], { tx: client });

    expect(view.get(1)?.quantity).toBe(3);
  });
});

describe('withAvailability', () => {
  /**
   * Coberto só no caso vazio, e isso é uma limitação da função, não do teste:
   * `withAvailability` é a única do módulo que não aceita `tx`, então todo
   * caminho com produto vai direto ao `prisma` importado e exige banco.
   *
   * Acrescentar `tx?: Prisma$Tx` às opções — como `getStockView` e
   * `getReservedByProduct` já têm — tornaria o resto testável sem banco. Fica
   * anotado em vez de mudado: alterar assinatura é refatoração, e a rede ainda
   * está sendo montada.
   */
  it('lista vazia devolve lista vazia sem tocar no banco', async () => {
    expect(await withAvailability([] as Array<{ id: number; quantity: number }>)).toEqual([]);
  });

  it('getStockView preserva os campos extras do produto', async () => {
    // A garantia equivalente, pela porta que aceita `tx`: o que entra a mais
    // no produto não é descartado pelo cálculo.
    const { client } = clientGroupBy([{ productId: 1, _sum: { quantity: 1 } }]);
    const view = await getStockView([{ id: 1, quantity: 5 }], { tx: client });

    expect(view.get(1)).toEqual({ productId: 1, quantity: 5, reserved: 1, available: 4 });
  });
});
