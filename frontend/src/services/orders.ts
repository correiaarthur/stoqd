import { api } from '../api';

type CartLine = { productId: number; quantity: number };

export type CreateOrderPayload = {
  cartToken: string;
  observation: string | null;
  paymentType: string;
  installmentsCount: number;
  couponCode: string | null;
  items: CartLine[];
};

export type ConfirmOrderPayload = {
  customerId?: number;
  createCustomer?: boolean;
  priceSource: 'order' | 'current';
  discount: number;
  keepCoupon: boolean;
  paymentType: string;
  installmentsCount: number;
};

export type CreateSalePayload = {
  customerId: number | null;
  observation: string | null;
  discount: number;
  installmentsCount: number;
  paymentType: string;
  items: CartLine[];
};

export const createOrder = (payload: CreateOrderPayload) => api.post('/orders', payload);
export const listOrders = (status: string) => api.get('/orders', { params: { status } });
export const confirmOrder = (id: number, payload: ConfirmOrderPayload) => api.post(`/orders/${id}/confirm`, payload);
export const cancelOrder = (id: number, reason: string) => api.post(`/orders/${id}/cancel`, { reason });

export const createSale = (payload: CreateSalePayload) => api.post('/sales', payload);
export const listSales = (params: { from?: string; limit?: number }) => api.get('/sales', { params });
