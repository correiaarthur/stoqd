import bcrypt from 'bcryptjs';
import type { z } from 'zod';

import { BCRYPT_ROUNDS, isAdminEmail } from '../lib/adminCredentials.js';
import { DomainError } from '../lib/errors.js';
import {
  HISTORY_ORDER_INCLUDE,
  HISTORY_SALE_INCLUDE,
  buildPurchaseHistory,
} from '../lib/orderHistory.js';
import { prisma } from '../lib/prisma.js';
import { duplicatedFieldsOf, rethrowTranslated } from '../lib/prismaErrors.js';
import { signCustomerToken } from '../lib/tokens.js';
import type { accountSchema, changePasswordSchema } from '../lib/validation.js';

/**
 * A conta do cliente: ver, editar, trocar a senha, apagar e o histórico de compras.
 *
 * O controller lê o HTTP e responde; aqui está o que acontece de fato. Os erros de
 * regra saem como `DomainError`, com o status certo.
 */

type AccountInput = z.output<typeof accountSchema>;
type ChangePasswordInput = z.output<typeof changePasswordSchema>;

/** Nunca devolvemos o hash da senha, nem a versão da sessão, nem por engano num spread. */
const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
  customerId: true,
} as const;

const NOT_FOUND = "Conta não encontrada.";

/**
 * Qual mensagem de "já existe": a constraint violada pode ser a do telefone ou a do
 * e-mail, e a mensagem precisa apontar o campo certo.
 */
export function duplicateAccountMessage(error: unknown, phoneMessage: string): string {
  return duplicatedFieldsOf(error).includes('email') ? "Este e-mail já está em uso." : phoneMessage;
}

export async function getAccount(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_FIELDS });

  if (!user) throw new DomainError(NOT_FOUND, 404);

  return user;
}

export async function updateAccount(userId: number, input: AccountInput) {
  const { name, email, phone } = input;

  // O admin não é um User: deixar usar o e-mail dele criaria uma conta de cliente que
  // responde pelo mesmo endereço no login.
  if (email !== null && isAdminEmail(email)) {
    throw new DomainError("Este e-mail já está em uso.", 409);
  }

  try {
    return await prisma.user.update({ where: { id: userId }, data: { name, email, phone }, select: PUBLIC_FIELDS });
  } catch (error) {
    return rethrowTranslated(error, {
      duplicate: duplicateAccountMessage(error, "Já existe uma conta com este telefone."),
      notFound: NOT_FOUND,
    });
  }
}

/**
 * Troca de senha exige a senha atual — sem isso, um token roubado troca a senha e
 * tranca o dono para fora da própria conta.
 *
 * Quem esqueceu a senha não passa por aqui: na primeira versão a redefinição é
 * manual, feita pela loja. A recuperação por e-mail fica para depois, e sai barata
 * porque o serviço de envio já entrou com o aviso de pedido.
 */
export async function changeAccountPassword(userId: number, input: ChangePasswordInput) {
  const { currentPassword, newPassword } = input;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new DomainError(NOT_FOUND, 404);

  // 400 e não 401: o 401 quer dizer "sessão inválida", e o cliente web reage a ele
  // limpando o token e indo para o login. Errar a senha atual não encerra a sessão
  // de ninguém.
  if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
    throw new DomainError("A senha atual não confere.", 400);
  }

  // Trocar a senha encerra as outras sessões: a versão sobe, e todo token emitido
  // antes deixa de valer — inclusive o que a pessoa usou agora. Por isso devolve um
  // token novo: este aparelho continua entrando, os outros caem.
  const { tokenVersion } = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });

  return { token: signCustomerToken({ id: userId, tokenVersion }) };
}

/**
 * Apaga a conta de acesso — e só ela.
 *
 * O Customer e as vendas ficam intactos: apagar o perfil remove os dados de acesso
 * da pessoa, não o histórico de saídas da loja. É por isso que conta e cliente são
 * tabelas separadas — não precisa de anonimização nem de `deletedAt` para o
 * histórico continuar fazendo sentido.
 *
 * Os pedidos e as reservas da pessoa saem junto, por cascade: um pedido pendente
 * sem conta é uma fila esperando resposta que não tem mais para quem ir. A venda já
 * confirmada não é afetada — `Order.saleId` aponta para a Sale, não o contrário.
 */
export async function deleteAccount(userId: number) {
  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (error) {
    rethrowTranslated(error, { notFound: NOT_FOUND });
  }
}

/**
 * Histórico de compras: os pedidos feitos pela vitrine e, quando existe vínculo
 * com um Customer, também as vendas de balcão dessa mesma pessoa.
 */
export async function getPurchaseHistory(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { customerId: true } });

  if (!user) throw new DomainError(NOT_FOUND, 404);

  // Só o vínculo feito pela loja (ao confirmar um pedido) abre as vendas de balcão.
  // Nunca se deduz do telefone da conta.
  const { customerId } = user;

  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: HISTORY_ORDER_INCLUDE,
  });

  // Compras do cliente ligado que não vieram por pedido: as vendas de balcão. As que
  // nasceram de um pedido já aparecem na lista acima.
  const orderedSaleIds = orders.map(order => order.saleId).filter((id): id is number => id !== null);

  const counterSales = customerId === null ? [] : await prisma.sale.findMany({
    where: { customerId, id: { notIn: orderedSaleIds } },
    orderBy: { date: 'desc' },
    take: 100,
    include: HISTORY_SALE_INCLUDE,
  });

  return { linkedToCustomer: customerId !== null, orders: buildPurchaseHistory(orders, counterSales) };
}
