export type Plan = { installments: number; interestPercent: number; active: boolean };

export type Coupon = {
  id: number;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minimumTotal: number | null;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  status: 'active' | 'inactive' | 'expired' | 'exhausted';
};

/** O formulário de cupom: tudo texto, como os campos entregam. */
export type CouponForm = {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  minimumTotal: string;
  expiresAt: string;
  maxUses: string;
};

export const EMPTY_COUPON: CouponForm = {
  code: '', type: 'PERCENT', value: '', minimumTotal: '', expiresAt: '', maxUses: '',
};
