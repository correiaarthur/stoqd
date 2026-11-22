import { api } from '../api';

export const getInstallmentPlans = () => api.get('/settings/installments');
export const saveInstallmentPlans = (plans: unknown) => api.put('/settings/installments', { plans });

export const listCoupons = () => api.get('/coupons');
export const createCoupon = (body: unknown) => api.post('/coupons', body);
export const updateCoupon = (id: number, body: unknown) => api.put(`/coupons/${id}`, body);
export const deleteCoupon = (id: number) => api.delete(`/coupons/${id}`);
