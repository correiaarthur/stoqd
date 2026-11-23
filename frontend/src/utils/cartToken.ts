const CART_TOKEN_KEY = 'cartToken';

/**
 * Identidade do carrinho no navegador.
 *
 * É o que liga o carrinho salvo em `localStorage` às reservas no servidor,
 * inclusive antes de existir conta — a reserva nasce antes do login. Fica no
 * mesmo lugar que o carrinho para os dois sumirem juntos.
 */
export function getCartToken(): string {
  const existing = localStorage.getItem(CART_TOKEN_KEY);
  if (existing) return existing;

  const token = crypto.randomUUID().replace(/-/g, '');
  localStorage.setItem(CART_TOKEN_KEY, token);

  return token;
}
