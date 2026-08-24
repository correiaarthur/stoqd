export const TOKEN_KEY = 'token';

export type Role = 'admin' | 'customer';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function readPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;

  try {
    return JSON.parse(atob(token.split('.')[1] ?? ''));
  } catch {
    return null;
  }
}

// O token vale 1 dia. Sem checar a expiração, a rota abre normalmente, toda
// chamada volta 401 e o operador fica olhando uma tela em branco.
export function isTokenValid(token: string | null = getToken()) {
  const payload = readPayload(token);
  if (!payload) return false;

  return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
}

/**
 * Papel de quem está logado.
 *
 * Serve só para a tela decidir o que mostrar — quem decide o que pode é o
 * servidor. Esconder um botão no navegador não protege rota nenhuma.
 */
export function getRole(): Role | null {
  const token = getToken();
  if (!isTokenValid(token)) return null;

  const role = readPayload(token)?.role;
  return role === 'admin' || role === 'customer' ? role : null;
}

export function isAdmin() {
  return getRole() === 'admin';
}

export function isCustomer() {
  return getRole() === 'customer';
}
