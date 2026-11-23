import axios from 'axios';
import { getToken, clearToken } from './utils/auth';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001'
});

api.interceptors.request.use((config) => {
  const token = getToken();

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// Token expirado ou inválido: limpa e manda para o login em vez de deixar a
// tela carregar vazia. O 401 do próprio login não redireciona — ali a mensagem
// de senha incorreta já é exibida na página.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRequest = error.config?.url?.includes('/auth/login');

    if (error.response?.status === 401 && !isAuthRequest) {
      clearToken();

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);
