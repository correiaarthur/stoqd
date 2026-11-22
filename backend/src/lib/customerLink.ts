import { prisma } from './prisma.js';
import { normalizePhone } from './validation.js';

/**
 * Procura o cliente da loja que tem este telefone e ainda não tem conta.
 *
 * O telefone do cliente é digitado à mão no cadastro da loja, com ou sem
 * pontuação; o da conta é guardado só com dígitos. Por isso a comparação é feita
 * nos dígitos dos dois lados — e em memória, já que a tabela de clientes de uma
 * loja pequena cabe folgada e não há coluna normalizada para indexar.
 *
 * Só candidatos sem conta entram: `User.customerId` é único, e dois logins no
 * mesmo histórico seriam dois donos para as mesmas compras.
 */
export async function findLinkableCustomer(phoneDigits: string) {
  if (!phoneDigits) return null;

  const candidates = await prisma.customer.findMany({
    where: { phone: { not: null }, user: { is: null } },
    select: { id: true, phone: true },
    orderBy: { id: 'asc' },
  });

  return candidates.find(customer => normalizePhone(customer.phone) === phoneDigits) ?? null;
}

/**
 * Contas criadas antes desta regra existir (ou com um cliente cadastrado depois)
 * ganham o vínculo na primeira leitura do histórico. Falha em silêncio: o
 * histórico em si não pode quebrar porque o vínculo não deu certo.
 */
export async function linkAccountToCustomer(userId: number, phoneDigits: string): Promise<number | null> {
  try {
    const customer = await findLinkableCustomer(phoneDigits);
    if (!customer) return null;

    await prisma.user.update({ where: { id: userId }, data: { customerId: customer.id } });
    return customer.id;
  } catch {
    return null;
  }
}
