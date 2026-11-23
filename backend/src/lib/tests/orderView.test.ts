import { describe, expect, it } from 'vitest';

import {
  buildAdminOrderView,
  buildItemView,
  buildRequestedView,
  contactsToMatch,
  suggestedCustomersFor,
  type AdminOrderRow,
  type CustomerCandidate,
} from '../orderView.js';

/**
 * Como o pedido aparece para a loja. Contas sobre dados já lidos: sem banco.
 */

type Item = AdminOrderRow['items'][number];

const item = (over: Omit<Partial<Item>, 'product'> & { product?: Partial<Item['product']> } = {}): Item => ({
  id: 1, orderId: 1, productId: 7, quantity: 2, unitPrice: 100,
  ...over,
  product: { id: 7, name: 'Sabonete', quantity: 10, sellingPrice: 100, promotionalPrice: null, ...over.product },
} as Item);

const order = (over: Partial<AdminOrderRow> = {}): AdminOrderRow => ({
  id: 1, status: 'PENDING', createdAt: new Date('2026-03-01T12:00:00Z'), userId: 5, saleId: null,
  cancelReason: null, observation: null, paymentType: 'VISTA', installmentsCount: 1, couponId: null,
  coupon: null,
  user: { id: 5, name: 'Ana', phone: '11988887777', email: null, customer: null },
  items: [item()],
  ...over,
} as AdminOrderRow);

const candidato = (over: Partial<CustomerCandidate> = {}): CustomerCandidate =>
  ({ id: 1, name: 'Cliente', phone: null, email: null, ...over });

const semEstoque = new Map<number, { available: number }>();

describe('buildItemView', () => {
  it('traz o preço do pedido, o de hoje e o estoque', () => {
    const view = buildItemView(item({ unitPrice: 100, quantity: 2 }), new Map([[7, { available: 4 }]]));

    expect(view).toEqual({
      productId: 7, name: 'Sabonete', quantity: 2, unitPrice: 100, currentPrice: 100,
      priceChanged: false, quantityInStock: 10, available: 4, hasStock: true,
    });
  });

  it('o preço de hoje é o promocional quando existe', () => {
    const view = buildItemView(item({ unitPrice: 100, product: { promotionalPrice: 80 } }), semEstoque);
    expect(view).toMatchObject({ currentPrice: 80, priceChanged: true });
  });

  it('diferença menor que meio centavo não é mudança de preço; meio centavo e meio, é', () => {
    expect(buildItemView(item({ unitPrice: 50.004, product: { sellingPrice: 50 } }), semEstoque).priceChanged).toBe(false);
    expect(buildItemView(item({ unitPrice: 50.006, product: { sellingPrice: 50 } }), semEstoque).priceChanged).toBe(true);
  });

  it('produto sem leitura de estoque vale disponível zero', () => {
    expect(buildItemView(item(), semEstoque).available).toBe(0);
  });

  it('há estoque quando o físico cobre a quantidade pedida — não o disponível', () => {
    expect(buildItemView(item({ quantity: 10, product: { quantity: 10 } }), new Map([[7, { available: 0 }]])).hasStock).toBe(true);
    expect(buildItemView(item({ quantity: 11, product: { quantity: 10 } }), semEstoque).hasStock).toBe(false);
  });
});

describe('suggestedCustomersFor', () => {
  const user = { phone: '11988887777', email: 'ana@x.com', customer: null };

  it('sugere o cliente com o mesmo telefone ou o mesmo e-mail', () => {
    const porTelefone = candidato({ id: 1, phone: '11988887777' });
    const porEmail = candidato({ id: 2, email: 'ana@x.com' });
    const outro = candidato({ id: 3, phone: '11900000000', email: 'outro@x.com' });

    expect(suggestedCustomersFor(user, [porTelefone, porEmail, outro]).map(c => c.id)).toEqual([1, 2]);
  });

  it('dois e-mails nulos não são a mesma pessoa', () => {
    expect(suggestedCustomersFor({ ...user, email: null }, [candidato({ email: null, phone: '11900000000' })])).toEqual([]);
  });

  it('conta sem e-mail casa só pelo telefone', () => {
    expect(suggestedCustomersFor({ ...user, email: null }, [candidato({ phone: '11988887777' })])).toHaveLength(1);
  });

  it('conta já ligada a um cliente não recebe sugestão', () => {
    const ligada = { ...user, customer: { id: 9, name: 'Já ligada' } };
    expect(suggestedCustomersFor(ligada, [candidato({ phone: '11988887777' })])).toEqual([]);
  });

  it('sem candidatos, lista vazia', () => {
    expect(suggestedCustomersFor(user, [])).toEqual([]);
  });
});

describe('contactsToMatch', () => {
  it('junta telefone e e-mail só das contas sem cliente, sem vazios', () => {
    const sem = order({ user: { id: 1, name: 'A', phone: '111', email: 'a@x.com', customer: null } });
    const semEmail = order({ user: { id: 2, name: 'B', phone: '222', email: null, customer: null } });
    const ligada = order({ user: { id: 3, name: 'C', phone: '333', email: 'c@x.com', customer: { id: 1, name: 'C' } } });

    expect(contactsToMatch([sem, semEmail, ligada])).toEqual(['111', 'a@x.com', '222']);
  });
});

describe('buildRequestedView', () => {
  const cupom = { id: 4, code: 'DEZ', type: 'PERCENT' as const, value: 10, minimumTotal: null, expiresAt: null, maxUses: null, usedCount: 0, active: true };

  it('à vista: sem juros, e a "parcela" é o total', () => {
    expect(buildRequestedView(order(), 200, new Map())).toEqual({
      paymentType: 'VISTA', installmentsCount: 1, interestPercent: 0, coupon: null,
      subtotal: 200, discount: 0, interest: 0, total: 200, installmentValue: 200,
    });
  });

  it('a prazo: juros sobre o valor já com desconto do cupom, e a parcela', () => {
    const pedido = order({ paymentType: 'PRAZO', installmentsCount: 4, couponId: 4, coupon: cupom } as Partial<AdminOrderRow>);

    expect(buildRequestedView(pedido, 200, new Map([[4, 5]]))).toEqual({
      paymentType: 'PRAZO', installmentsCount: 4, interestPercent: 5,
      coupon: { id: 4, code: 'DEZ', discount: 20 },
      subtotal: 200, discount: 20, interest: 9, total: 189, installmentValue: 47.25,
    });
  });

  it('parcelamento que a loja desligou: taxa null e nenhum juro inventado', () => {
    const view = buildRequestedView(order({ paymentType: 'PRAZO', installmentsCount: 6 }), 100, new Map());

    expect(view.interestPercent).toBeNull();
    expect(view.interest).toBe(0);
    expect(view.total).toBe(100);
  });

  it('0% é uma taxa, não ausência: sem juros, mas com a parcela dividida', () => {
    const view = buildRequestedView(order({ paymentType: 'PRAZO', installmentsCount: 2 }), 100, new Map([[2, 0]]));

    expect(view).toMatchObject({ interestPercent: 0, interest: 0, total: 100, installmentValue: 50 });
  });

  it('cupom fixo nunca passa do subtotal', () => {
    const grande = { ...cupom, type: 'FIXED' as const, value: 500 };
    const view = buildRequestedView(order({ couponId: 4, coupon: grande } as Partial<AdminOrderRow>), 80, new Map());

    expect(view.coupon).toMatchObject({ discount: 80 });
    expect(view.total).toBe(0);
  });
});

describe('buildAdminOrderView', () => {
  it('monta o pedido inteiro: totais, itens, cliente e se há estoque para todos', () => {
    const pedido = order({
      items: [
        item({ productId: 7, quantity: 1, unitPrice: 100 }),
        item({ productId: 8, quantity: 3, unitPrice: 10, product: { id: 8, name: 'Creme', quantity: 2, sellingPrice: 10 } }),
      ],
    });

    const view = buildAdminOrderView(pedido, { stock: new Map([[7, { available: 5 }]]), planRates: new Map(), candidates: [] });

    expect(view).toMatchObject({ id: 1, status: 'PENDING', saleId: null, total: 130, hasStockForAll: false });
    expect(view.items.map(i => i.productId)).toEqual([7, 8]);
    expect(view.user).toEqual({ id: 5, name: 'Ana', phone: '11988887777', email: null, customer: null });
    expect(view.requested.subtotal).toBe(130);
    expect(view.suggestedCustomers).toEqual([]);
  });

  it('o total do pedido é o dos itens ao preço do pedido, não ao de hoje', () => {
    const pedido = order({ items: [item({ quantity: 2, unitPrice: 100, product: { sellingPrice: 999 } })] });

    expect(buildAdminOrderView(pedido, { stock: semEstoque, planRates: new Map(), candidates: [] }).total).toBe(200);
  });
});
