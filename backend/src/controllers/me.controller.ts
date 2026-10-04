import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';

import { prisma } from '../lib/prisma.js';
import { BCRYPT_ROUNDS, isAdminEmail } from '../lib/adminCredentials.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import { sumLines } from '../lib/pricingRules.js';
import {
  normalizeName,
  normalizePhone,
  optionalEmail,
  validateAccountFields,
  validatePassword,
} from '../lib/validation.js';

/** Nunca devolvemos o hash da senha, nem por engano num spread. */
const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
  customerId: true,
} as const;

function currentUserId(req: Request) {
  return req.auth?.userId;
}

export async function show(req: Request, res: Response) {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Faça login novamente." });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_FIELDS });

    if (!user) return res.status(404).json({ error: "Conta não encontrada." });

    return res.json(user);
  } catch (error) {
    console.error("Erro ao carregar conta:", error);
    return res.status(500).json({ error: "Não foi possível carregar sua conta." });
  }
}

export async function update(req: Request, res: Response) {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Faça login novamente." });

  const name = normalizeName(req.body?.name);
  const email = optionalEmail(req.body?.email);
  const phone = normalizePhone(req.body?.phone);

  const fieldError = validateAccountFields({ name, email, phone });
  if (fieldError) return res.status(400).json({ error: fieldError.error });

  if (email !== null && isAdminEmail(email)) {
    return res.status(409).json({ error: "Este e-mail já está em uso." });
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name, email, phone },
      select: PUBLIC_FIELDS,
    });

    return res.json(user);
  } catch (error) {
    const duplicatedField = (error as { meta?: { target?: string[] } })?.meta?.target ?? [];

    const translated = translatePrismaError(error, {
      duplicate: duplicatedField.includes('email')
        ? "Este e-mail já está em uso."
        : "Já existe uma conta com este telefone.",
      notFound: "Conta não encontrada.",
    });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao atualizar conta:", error);
    return res.status(500).json({ error: "Não foi possível salvar suas alterações." });
  }
}

/**
 * Troca de senha exige a senha atual — sem isso, um token roubado troca a senha
 * e tranca o dono para fora da própria conta.
 *
 * Quem esqueceu a senha não passa por aqui: na primeira versão a redefinição é
 * manual, feita por você. A recuperação por e-mail fica para depois, e sai
 * barata porque o serviço de envio já entrou com o aviso de pedido.
 */
export async function changePassword(req: Request, res: Response) {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Faça login novamente." });

  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = req.body?.newPassword;

  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "Conta não encontrada." });

    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: "A senha atual não confere." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao trocar a senha:", error);
    return res.status(500).json({ error: "Não foi possível trocar a senha." });
  }
}

/**
 * Apaga a conta de acesso — e só ela.
 *
 * O Customer e as vendas ficam intactos: apagar o perfil remove os dados de
 * acesso da pessoa, não o histórico de saídas da loja. É por isso que conta e
 * cliente são tabelas separadas — não precisa de anonimização nem de
 * `deletedAt` para o histórico continuar fazendo sentido.
 *
 * Os pedidos e as reservas da pessoa saem junto, por cascade: um pedido
 * pendente sem conta é uma fila esperando resposta que não tem mais para quem
 * ir. A venda já confirmada não é afetada — `Order.saleId` aponta para a Sale,
 * não o contrário.
 */
export async function remove(req: Request, res: Response) {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Faça login novamente." });

  try {
    await prisma.user.delete({ where: { id: userId } });

    return res.status(204).send();
  } catch (error) {
    const translated = translatePrismaError(error, { notFound: "Conta não encontrada." });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao excluir conta:", error);
    return res.status(500).json({ error: "Não foi possível excluir sua conta." });
  }
}

/**
 * Histórico de compras: os pedidos feitos pela vitrine e, quando existe
 * vínculo com um Customer, também as vendas de balcão dessa mesma pessoa.
 */
export async function orders(req: Request, res: Response) {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Faça login novamente." });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { customerId: true },
    });

    if (!user) return res.status(404).json({ error: "Conta não encontrada." });

    const orderList = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        items: { include: { product: { select: { name: true } } } },
        sale: {
          include: {
            installments: { orderBy: { number: 'asc' } },
            coupon: { select: { code: true } },
          },
        },
      },
    });

    const payload = orderList.map(order => {
      const installments = order.sale?.installments ?? [];
      const pending = installments.filter(installment => !installment.paidAt);

      return {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        cancelReason: order.cancelReason,
        saleId: order.saleId,
        // Enquanto pendente o total é o do pedido; confirmado, é o que a venda
        // realmente cobrou — desconto, juros e mudança de preço já aplicados.
        total: order.sale?.total ?? sumLines(order.items),
        discount: order.sale?.discount ?? 0,
        interest: order.sale?.interest ?? 0,
        couponCode: order.sale?.coupon?.code ?? null,
        items: order.items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        installments: installments.map(installment => ({
          number: installment.number,
          value: installment.value,
          dueDate: installment.dueDate,
          paidAt: installment.paidAt,
        })),
        pendingAmount: pending.reduce((acc, installment) => acc + installment.value, 0),
        isPaid: installments.length > 0 && pending.length === 0,
      };
    });

    return res.json({ linkedToCustomer: user.customerId !== null, orders: payload });
  } catch (error) {
    console.error("Erro ao buscar o histórico:", error);
    return res.status(500).json({ error: "Não foi possível carregar seu histórico." });
  }
}
