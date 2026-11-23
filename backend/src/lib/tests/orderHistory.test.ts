import { describe, expect, it } from 'vitest';

import {
  buildOrderEntry,
  buildPurchaseHistory,
  buildSaleEntry,
  serializeInstallments,
  serializeItems,
  type HistoryOrderRow,
  type HistorySaleRow,
} from '../orderHistory.js';

/**
 * O histórico de compras como a tela "Minha conta" o recebe. Montagem sobre dados
 * já lidos: sem banco.
 */

const dia = (n: number) => new Date(Date.UTC(2026, 0, n, 12));

const parcela = (number: number, value: number, paid = false) =>
  ({ id: number, number, value, dueDate: dia(number + 10), paidAt: paid ? dia(number + 10) : null, saleId: 1 });

const item = (name: string, quantity: number, unitPrice: number) => ({ quantity, unitPrice, product: { name } });

const venda = (over: Partial<HistorySaleRow> = {}): HistorySaleRow => ({
  id: 1, total: 100, discount: 0, interest: 0, date: dia(5), customerId: 9, couponId: null, observation: null,
  items: [item('Sabonete', 2, 50)], installments: [], coupon: null,
  ...over,
} as HistorySaleRow);

const pedido = (over: Partial<HistoryOrderRow> = {}): HistoryOrderRow => ({
  id: 1, status: 'PENDING', createdAt: dia(5), cancelReason: null, saleId: null, sale: null,
  items: [item('Sabonete', 2, 50)],
  ...over,
} as HistoryOrderRow);

describe('serializeItems', () => {
  it('só o nome, a quantidade e o preço: o produto inteiro não sai', () => {
    expect(serializeItems([item('Creme', 3, 12.5)])).toEqual([{ name: 'Creme', quantity: 3, unitPrice: 12.5 }]);
  });

  it('lista vazia', () => {
    expect(serializeItems([])).toEqual([]);
  });
});

describe('serializeInstallments', () => {
  it('sem parcelas: nada a pagar e não está quitado (não há o que quitar)', () => {
    expect(serializeInstallments([])).toEqual({ installments: [], pendingAmount: 0, isPaid: false });
  });

  it('soma só o que está em aberto', () => {
    const r = serializeInstallments([parcela(1, 30, true), parcela(2, 30), parcela(3, 40)]);

    expect(r.pendingAmount).toBe(70);
    expect(r.isPaid).toBe(false);
  });

  it('todas pagas: quitado, e nada em aberto', () => {
    expect(serializeInstallments([parcela(1, 50, true), parcela(2, 50, true)])).toMatchObject({ pendingAmount: 0, isPaid: true });
  });

  it('cada parcela diz só número, valor, vencimento e pagamento', () => {
    const [p] = serializeInstallments([parcela(1, 10)]).installments;

    expect(Object.keys(p!).sort()).toEqual(['dueDate', 'number', 'paidAt', 'value']);
  });
});

describe('buildOrderEntry', () => {
  it('pendente: o total é o dos itens ao preço do pedido, sem venda', () => {
    expect(buildOrderEntry(pedido({ items: [item('A', 2, 10), item('B', 1, 5.5)] as never }))).toEqual({
      source: 'ORDER', id: 1, status: 'PENDING', createdAt: dia(5), cancelReason: null, saleId: null,
      total: 25.5, discount: 0, interest: 0, couponCode: null,
      items: [{ name: 'A', quantity: 2, unitPrice: 10 }, { name: 'B', quantity: 1, unitPrice: 5.5 }],
      installments: [], pendingAmount: 0, isPaid: false,
    });
  });

  it('confirmado: tudo vem da venda — o que ela cobrou, e não o que o pedido dizia', () => {
    const entrada = buildOrderEntry(pedido({
      status: 'CONFIRMED', saleId: 7, items: [item('A', 2, 90)] as never,
      sale: venda({ id: 7, total: 189, discount: 20, interest: 9, coupon: { code: 'CICLO10' }, installments: [parcela(1, 94.5, true), parcela(2, 94.5)] as never }) as never,
    }));

    expect(entrada).toMatchObject({ total: 189, discount: 20, interest: 9, couponCode: 'CICLO10', saleId: 7, pendingAmount: 94.5, isPaid: false });
  });

  it('recusado: leva o motivo', () => {
    expect(buildOrderEntry(pedido({ status: 'CANCELLED', cancelReason: 'Sem estoque' }))).toMatchObject({ status: 'CANCELLED', cancelReason: 'Sem estoque' });
  });

  it('venda com desconto e juros nulos (venda antiga) vale zero', () => {
    const entrada = buildOrderEntry(pedido({ sale: venda({ discount: null, interest: null }) as never }));
    expect(entrada).toMatchObject({ discount: 0, interest: 0 });
  });
});

describe('buildSaleEntry', () => {
  it('venda de balcão: já confirmada, com o id da própria venda', () => {
    expect(buildSaleEntry(venda({ id: 4, total: 80, discount: 5, interest: 1, date: dia(8), coupon: { code: 'X' } as never }))).toEqual({
      source: 'SALE', id: 4, status: 'CONFIRMED', createdAt: dia(8), cancelReason: null, saleId: 4,
      total: 80, discount: 5, interest: 1, couponCode: 'X',
      items: [{ name: 'Sabonete', quantity: 2, unitPrice: 50 }],
      installments: [], pendingAmount: 0, isPaid: false,
    });
  });

  it('desconto, juros e cupom ausentes valem 0, 0 e null', () => {
    expect(buildSaleEntry(venda({ discount: null, interest: null, coupon: null }))).toMatchObject({ discount: 0, interest: 0, couponCode: null });
  });

  it('a data da venda é `date`, não `createdAt`', () => {
    expect(buildSaleEntry(venda({ date: dia(20) })).createdAt).toEqual(dia(20));
  });
});

describe('buildPurchaseHistory', () => {
  it('junta pedidos e vendas, do mais novo para o mais antigo', () => {
    const historico = buildPurchaseHistory(
      [pedido({ id: 1, createdAt: dia(3) }), pedido({ id: 2, createdAt: dia(9) })],
      [venda({ id: 3, date: dia(6) }), venda({ id: 4, date: dia(12) })]
    );

    expect(historico.map(h => `${h.source}${h.id}`)).toEqual(['SALE4', 'ORDER2', 'SALE3', 'ORDER1']);
  });

  it('sem nada, lista vazia', () => {
    expect(buildPurchaseHistory([], [])).toEqual([]);
  });

  it('só pedidos, ou só vendas', () => {
    expect(buildPurchaseHistory([pedido()], []).map(h => h.source)).toEqual(['ORDER']);
    expect(buildPurchaseHistory([], [venda()]).map(h => h.source)).toEqual(['SALE']);
  });

  it('não altera as listas de quem chamou', () => {
    const pedidos = [pedido({ id: 1, createdAt: dia(1) }), pedido({ id: 2, createdAt: dia(9) })];
    buildPurchaseHistory(pedidos, []);

    expect(pedidos.map(p => p.id)).toEqual([1, 2]);
  });
});
