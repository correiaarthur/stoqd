import { api } from '../api';

export type CustomerPayload = { name: string; phone?: string; email?: string };

export const listCustomers = <T>() => api.get<T[]>('/customers');
export const getCustomerStatement = <T>(id: number) => api.get<T>(`/customers/${id}/statement`);
export const createCustomer = <T>(payload: CustomerPayload) => api.post<T>('/customers', payload);
export const updateCustomer = (id: number, payload: CustomerPayload) => api.put(`/customers/${id}`, payload);
export const deleteCustomer = (id: number) => api.delete(`/customers/${id}`);

/** A data do pagamento é do servidor; o corpo não leva nada. */
export const payInstallment = (id: number) => api.patch(`/installments/${id}/pay`);
