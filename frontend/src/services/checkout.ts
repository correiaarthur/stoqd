import { api } from '../api';

type CartPayload = { cartToken: string; items: Array<{ productId: number; quantity: number }> };

export const checkAvailability = (payload: CartPayload) => api.post('/cart/availability', payload);
export const reserveCart = (payload: CartPayload) => api.post('/cart/reserve', payload);
export const releaseCart = (cartToken: string) => api.post('/cart/release', { cartToken });

export const getPaymentOptions = (subtotal: number) => api.get('/payment/options', { params: { subtotal } });
export const validateCoupon = (code: string, subtotal: number) =>
  api.post('/payment/coupons/validate', { code, subtotal });
