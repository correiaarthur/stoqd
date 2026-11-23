import { signAdminToken, signCustomerToken } from '../../src/lib/tokens.js';
import { criarConta } from './factories.js';

/**
 * Tokens de verdade para os testes: com a versão da sessão (cliente) ou a
 * impressão das credenciais (admin). Um `jwt.sign({ role: 'admin' })` solto já
 * não passa — o servidor recusa token que não carrega o marcador de revogação.
 */

export const cabecalhoAdmin = () => ({ Authorization: `Bearer ${signAdminToken()}` });

export const cabecalhoCliente = (conta: { id: number; tokenVersion: number }) => ({
  Authorization: `Bearer ${signCustomerToken(conta)}`,
});

/** Uma conta de cliente que existe no banco, com o token dela. */
export async function criarClienteLogado() {
  const conta = await criarConta();

  return { conta, token: signCustomerToken(conta), cabecalho: cabecalhoCliente(conta) };
}
