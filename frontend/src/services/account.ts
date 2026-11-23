import { api } from '../api';

export const login = (identifier: string, password: string) => api.post('/auth/login', { identifier, password });
export const register = (form: unknown) => api.post('/auth/register', form);

export const getMe = () => api.get('/me');
export const getMyOrders = () => api.get('/me/orders');
export const updateMe = (form: unknown) => api.put('/me', form);
/**
 * Trocar a senha encerra as outras sessões, e a resposta traz um token novo para
 * esta continuar: quem chama precisa guardá-lo.
 */
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.put<{ token: string }>('/me/password', { currentPassword, newPassword });
export const deleteMe = () => api.delete('/me');
