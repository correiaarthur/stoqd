import { api } from '../api';

export const login = (identifier: string, password: string) => api.post('/auth/login', { identifier, password });
export const register = (form: unknown) => api.post('/auth/register', form);

export const getMe = () => api.get('/me');
export const getMyOrders = () => api.get('/me/orders');
export const updateMe = (form: unknown) => api.put('/me', form);
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.put('/me/password', { currentPassword, newPassword });
export const deleteMe = () => api.delete('/me');
