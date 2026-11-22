import { describe, expect, it } from 'vitest';

import {
  parseOrderCancel,
  parseOrderConfirm,
  parseOrderCreate,
  parseOrderListQuery,
} from '../orderInput.js';

const items = [{ productId: 1, quantity: 2 }];
const erro = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

describe('parseOrderCreate', () => {
  it('à vista por padrão, com uma parcela, sem cupom e sem observação', () => {
    expect(parseOrderCreate({ items })).toEqual({
      ok: true,
      data: { cartToken: null, items, observation: null, paymentType: 'VISTA', installmentsCount: 1 },
    });
  });

  it('à vista ignora o parcelamento que sobrou na tela: é sempre uma parcela', () => {
    expect(parseOrderCreate({ items, paymentType: 'VISTA', installmentsCount: 6 }))
      .toMatchObject({ ok: true, data: { installmentsCount: 1 } });
    expect(parseOrderCreate({ items, paymentType: 'VISTA', installmentsCount: 0.5 }))
      .toMatchObject({ ok: true, data: { installmentsCount: 1 } });
  });

  it('a prazo vale o que veio, de 1x a 12x; ausente vale 1x', () => {
    expect(parseOrderCreate({ items, paymentType: 'PRAZO', installmentsCount: 6 }))
      .toMatchObject({ ok: true, data: { paymentType: 'PRAZO', installmentsCount: 6 } });
    expect(parseOrderCreate({ items, paymentType: 'PRAZO' })).toMatchObject({ ok: true, data: { installmentsCount: 1 } });
  });

  it.each([0, -3, 0.5, 1.5, 13, 'abc', true, []])('a prazo recusa %j parcelas', (installmentsCount) => {
    expect(erro(parseOrderCreate({ items, paymentType: 'PRAZO', installmentsCount }))).toBe('O parcelamento precisa ser de 1x a 12x.');
  });

  it('forma de pagamento desconhecida é recusada, em vez de valer à vista em silêncio', () => {
    for (const paymentType of ['PRZO', 'pix', 1]) {
      expect(erro(parseOrderCreate({ items, paymentType }))).toBe('Forma de pagamento inválida.');
    }
  });

  it('observação: aparada, cortada em 500, e vazia vira null', () => {
    expect(parseOrderCreate({ items, observation: '  retiro no sábado ' })).toMatchObject({ data: { observation: 'retiro no sábado' } });
    expect(parseOrderCreate({ items, observation: '   ' })).toMatchObject({ data: { observation: null } });
    const longa = parseOrderCreate({ items, observation: 'x'.repeat(900) });
    expect(longa.ok && longa.data.observation).toHaveLength(500);
  });

  it('o token do carrinho inválido vale como ausente: o pedido nasce, sem reserva para prender', () => {
    expect(parseOrderCreate({ items, cartToken: 'curto' })).toMatchObject({ ok: true, data: { cartToken: null } });
    expect(parseOrderCreate({ items, cartToken: 'abcdefghijklmnop1234' })).toMatchObject({ data: { cartToken: 'abcdefghijklmnop1234' } });
  });

  it('a lista de itens segue as regras do carrinho', () => {
    expect(erro(parseOrderCreate({ items: [] }))).toBe('O carrinho está vazio.');
    expect(erro(parseOrderCreate({}))).toBe('O carrinho está vazio.');
    expect(erro(parseOrderCreate({ items: [{ productId: 1, quantity: -1 }] }))).toMatch(/quantidade/);
  });

  it('o cupom chega como veio: quem o valida é a transação', () => {
    expect(parseOrderCreate({ items, couponCode: 'CICLO10' })).toMatchObject({ data: { couponCode: 'CICLO10' } });
  });

  it('campo de fora (userId, status, preço) não passa adiante', () => {
    const r = parseOrderCreate({ items, userId: 99, status: 'CONFIRMED', unitPrice: 0 });
    expect(r.ok && Object.keys(r.data).sort()).toEqual(['cartToken', 'installmentsCount', 'items', 'observation', 'paymentType']);
  });
});

describe('parseOrderConfirm', () => {
  it('sem nada, vale o padrão: preço do pedido, sem desconto, mantém o cupom', () => {
    expect(parseOrderConfirm({})).toEqual({
      ok: true,
      data: {
        customerId: null, createCustomer: false, priceSource: 'order', discount: 0,
        installmentsCount: undefined, paymentType: undefined, observation: null, keepCoupon: true,
      },
    });
  });

  it('corpo ausente também confirma com o padrão', () => {
    expect(parseOrderConfirm(undefined)).toMatchObject({ ok: true, data: { priceSource: 'order' } });
  });

  it('o preço é o do pedido ou o de hoje; o resto é recusado', () => {
    expect(parseOrderConfirm({ priceSource: 'current' })).toMatchObject({ data: { priceSource: 'current' } });
    expect(erro(parseOrderConfirm({ priceSource: 'hoje' })))
      .toBe('Escolha se o pedido será cobrado pelo preço do pedido ou pelo preço de hoje.');
  });

  it('cliente escolhido: inteiro positivo; "criar" só com true', () => {
    expect(parseOrderConfirm({ customerId: '12' })).toMatchObject({ data: { customerId: 12 } });
    expect(erro(parseOrderConfirm({ customerId: 'abc' }))).toBe('Cliente escolhido inválido.');
    expect(erro(parseOrderConfirm({ customerId: -4 }))).toBe('Cliente escolhido inválido.');
    expect(parseOrderConfirm({ createCustomer: true })).toMatchObject({ data: { createCustomer: true } });
    expect(parseOrderConfirm({ createCustomer: 'true' })).toMatchObject({ data: { createCustomer: false } });
  });

  it('desconto digitado: número, e o que não for vale 0 (quem recusa negativo é a venda)', () => {
    expect(parseOrderConfirm({ discount: '12.5' })).toMatchObject({ data: { discount: 12.5 } });
    expect(parseOrderConfirm({ discount: 'abc' })).toMatchObject({ data: { discount: 0 } });
    expect(parseOrderConfirm({ discount: -5 })).toMatchObject({ data: { discount: -5 } });
  });

  it('troca de parcelas e de pagamento: opcional, e quando vem precisa servir', () => {
    expect(parseOrderConfirm({ installmentsCount: 6, paymentType: 'PRAZO' }))
      .toMatchObject({ data: { installmentsCount: 6, paymentType: 'PRAZO' } });
    expect(parseOrderConfirm({ installmentsCount: '', paymentType: '' }))
      .toMatchObject({ data: { installmentsCount: undefined, paymentType: undefined } });

    for (const installmentsCount of [0, -3, 0.5, 13]) {
      expect(erro(parseOrderConfirm({ installmentsCount }))).toBe('O parcelamento precisa ser de 1x a 12x.');
    }
    expect(erro(parseOrderConfirm({ paymentType: 'PRZO' }))).toBe('Forma de pagamento inválida.');
  });

  it('só `false` descarta o cupom do cliente', () => {
    expect(parseOrderConfirm({ keepCoupon: false })).toMatchObject({ data: { keepCoupon: false } });
    expect(parseOrderConfirm({ keepCoupon: 0 })).toMatchObject({ data: { keepCoupon: true } });
  });
});

describe('parseOrderCancel', () => {
  it('o motivo é obrigatório, com pelo menos 3 letras, e aparado', () => {
    expect(parseOrderCancel({ reason: '  Sem estoque  ' })).toEqual({ ok: true, data: { reason: 'Sem estoque' } });

    for (const reason of ['', '  ', 'ab', undefined, null]) {
      expect(erro(parseOrderCancel({ reason }))).toBe('Explique o motivo da recusa — é o que o cliente vai ler.');
    }
  });

  it('o motivo é cortado em 300 caracteres', () => {
    const r = parseOrderCancel({ reason: 'x'.repeat(500) });
    expect(r.ok && r.data.reason).toHaveLength(300);
  });
});

describe('parseOrderListQuery', () => {
  it('sem filtro, os pendentes; aceita minúscula', () => {
    expect(parseOrderListQuery({})).toEqual({ ok: true, data: { status: 'PENDING' } });
    expect(parseOrderListQuery({ status: 'all' })).toEqual({ ok: true, data: { status: 'ALL' } });
    expect(parseOrderListQuery({ status: 'cancelled' })).toEqual({ ok: true, data: { status: 'CANCELLED' } });
  });

  it('situação desconhecida é recusada', () => {
    expect(erro(parseOrderListQuery({ status: 'DONE' }))).toBe('Situação inválida.');
  });
});
