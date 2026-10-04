import { describe, expect, it } from 'vitest';

import {
  type CouponRow,
  checkCoupon,
  couponDiscountFor,
  isValidCouponCode,
  normalizeCouponCode,
} from './coupons.js';

/**
 * Cupons: zero usos em produção. Todo o caminho abaixo nunca rodou.
 *
 * `checkCoupon` recebe o client como parâmetro justamente para poder ser
 * exercitado sem banco — é o que estes testes usam.
 */

function cupom(over: Partial<CouponRow> = {}): CouponRow {
  return {
    id: 1,
    code: 'CICLO10',
    type: 'PERCENT',
    value: 10,
    minimumTotal: null,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    active: true,
    ...over,
  };
}

/** Client falso que devolve sempre a mesma linha. */
function clientCom(row: CouponRow | null) {
  return { coupon: { findUnique: async () => row } } as never;
}

describe('normalizeCouponCode', () => {
  it('apara e sobe para maiúsculas', () => {
    expect(normalizeCouponCode('  ciclo10 ')).toBe('CICLO10');
  });

  it('nulo e indefinido viram string vazia', () => {
    expect(normalizeCouponCode(null)).toBe('');
    expect(normalizeCouponCode(undefined)).toBe('');
  });
});

describe('isValidCouponCode', () => {
  it('aceita de 3 a 24 caracteres entre letras, números e hífen', () => {
    expect(isValidCouponCode('ABC')).toBe(true);
    expect(isValidCouponCode('BLACK-FRIDAY-2026')).toBe(true);
    expect(isValidCouponCode('A'.repeat(24))).toBe(true);
  });

  it('recusa curto demais, longo demais e caractere de fora', () => {
    expect(isValidCouponCode('AB')).toBe(false);
    expect(isValidCouponCode('A'.repeat(25))).toBe(false);
    expect(isValidCouponCode('CICLO 10')).toBe(false);
    expect(isValidCouponCode('ciclo10')).toBe(false);
  });

  it('não aceita hífen na primeira posição', () => {
    expect(isValidCouponCode('-ABC')).toBe(false);
  });
});

describe('couponDiscountFor', () => {
  it('percentual incide sobre o subtotal', () => {
    expect(couponDiscountFor({ type: 'PERCENT', value: 10 }, 200)).toBe(20);
  });

  it('fixo é o próprio valor', () => {
    expect(couponDiscountFor({ type: 'FIXED', value: 30 }, 200)).toBe(30);
  });

  it('nunca passa do subtotal — a loja não paga para vender', () => {
    expect(couponDiscountFor({ type: 'FIXED', value: 300 }, 200)).toBe(200);
    expect(couponDiscountFor({ type: 'PERCENT', value: 150 }, 200)).toBe(200);
  });

  it('valor negativo não vira acréscimo', () => {
    expect(couponDiscountFor({ type: 'FIXED', value: -50 }, 200)).toBe(0);
  });

  it('arredonda para o centavo', () => {
    expect(couponDiscountFor({ type: 'PERCENT', value: 10 }, 33.33)).toBe(3.33);
  });

  it('subtotal zero não gera desconto', () => {
    expect(couponDiscountFor({ type: 'FIXED', value: 10 }, 0)).toBe(0);
  });
});

describe('checkCoupon', () => {
  it('aceita e devolve o desconto calculado', async () => {
    const r = await checkCoupon(clientCom(cupom()), 'CICLO10', 200);
    expect(r).toEqual({ ok: true, couponId: 1, code: 'CICLO10', discount: 20 });
  });

  it('normaliza o código antes de buscar', async () => {
    let buscado: unknown;
    const client = {
      coupon: {
        findUnique: async ({ where }: { where: { code: string } }) => {
          buscado = where.code;
          return cupom();
        },
      },
    } as never;

    await checkCoupon(client, '  ciclo10 ', 100);
    expect(buscado).toBe('CICLO10');
  });

  it('código mal formado nem chega ao banco', async () => {
    const explode = {
      coupon: { findUnique: () => { throw new Error('não deveria consultar'); } },
    } as never;

    const r = await checkCoupon(explode, 'AB', 100);
    expect(r).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('inexistente é recusado de forma deliberadamente vaga', async () => {
    // Distinguir "não existe" de "existe mas está inativo" ajudaria quem
    // estivesse tentando adivinhar códigos.
    const r = await checkCoupon(clientCom(null), 'CICLO10', 100);
    expect(r).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('desativado', async () => {
    const r = await checkCoupon(clientCom(cupom({ active: false })), 'CICLO10', 100);
    expect(r).toMatchObject({ ok: false, reason: 'inactive' });
  });

  it('vencido', async () => {
    const ontem = new Date(Date.now() - 86_400_000);
    const r = await checkCoupon(clientCom(cupom({ expiresAt: ontem })), 'CICLO10', 100);
    expect(r).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('data futura ainda vale', async () => {
    const amanha = new Date(Date.now() + 86_400_000);
    const r = await checkCoupon(clientCom(cupom({ expiresAt: amanha })), 'CICLO10', 100);
    expect(r.ok).toBe(true);
  });

  it('esgotado quando os usos atingem o teto', async () => {
    const r = await checkCoupon(clientCom(cupom({ maxUses: 5, usedCount: 5 })), 'CICLO10', 100);
    expect(r).toMatchObject({ ok: false, reason: 'exhausted' });
  });

  it('um uso antes do teto ainda vale', async () => {
    const r = await checkCoupon(clientCom(cupom({ maxUses: 5, usedCount: 4 })), 'CICLO10', 100);
    expect(r.ok).toBe(true);
  });

  it('sem teto de usos nunca esgota', async () => {
    const r = await checkCoupon(clientCom(cupom({ maxUses: null, usedCount: 9999 })), 'CICLO10', 100);
    expect(r.ok).toBe(true);
  });

  it('abaixo do mínimo informa qual é o mínimo', async () => {
    // A tela precisa do número para dizer quanto falta.
    const r = await checkCoupon(clientCom(cupom({ minimumTotal: 150 })), 'CICLO10', 100);
    expect(r).toMatchObject({ ok: false, reason: 'below_minimum', minimumTotal: 150 });
  });

  it('exatamente no mínimo vale', async () => {
    const r = await checkCoupon(clientCom(cupom({ minimumTotal: 150 })), 'CICLO10', 150);
    expect(r.ok).toBe(true);
  });
});
