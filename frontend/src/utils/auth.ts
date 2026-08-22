export const TOKEN_KEY = 'token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// O token vale 1 dia. Sem checar a expiração, a rota abre normalmente, toda
// chamada volta 401 e o operador fica olhando uma tela em branco.
export function isTokenValid(token: string | null = getToken()) {
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
