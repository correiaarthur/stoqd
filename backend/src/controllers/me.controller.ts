import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';

import { prisma } from '../lib/prisma.js';
import { signCustomerToken } from '../lib/tokens.js';
import { customerUserId } from '../middlewares/auth.js';
import { BCRYPT_ROUNDS, isAdminEmail } from '../lib/adminCredentials.js';
import { duplicatedFieldsOf, translatePrismaError } from '../lib/prismaErrors.js';
import { sumLines } from '../lib/pricingRules.js';
import { parseWith } from '../lib/validate.js';
import { accountSchema, changePasswordSchema } from '../lib/validation.js';

/** Nunca devolvemos o hash da senha, nem por engano num spread. */
const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
  customerId: true,
} as const;

export async function show(req: Request, res: Response) {
  const userId = customerUserId(req);

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
  const userId = customerUserId(req);

  const parsed = parseWith(accountSchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const { name, email, phone } = parsed.data;

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
    const duplicatedField = duplicatedFieldsOf(error);

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
  const userId = customerUserId(req);

  const parsed = parseWith(changePasswordSchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "Conta não encontrada." });

    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
      // 400 e não 401: o 401 quer dizer "sessão inválida", e o cliente web reage a
      // ele limpando o token e indo para o login. Errar a senha atual não encerra
      // a sessão de ninguém.
      return res.status(400).json({ error: "A senha atual não confere." });
    }

    // Trocar a senha encerra as outras sessões: a versão sobe, e todo token emitido
    // antes deixa de valer — inclusive o que a pessoa usou agora. Por isso a resposta
    // traz um token novo: este aparelho continua entrando, os outros caem.
    const { tokenVersion } = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });

    return res.json({ token: signCustomerToken({ id: userId, tokenVersion }) });
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
  const userId = customerUserId(req);

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


type LineItem = { quantity: number; unitPrice: number; product: { name: string } };
type InstallmentRow = { number: number; value: number; dueDate: Date; paidAt: Date | null };

function serializeItems(items: LineItem[]) {
  return items.map(item => ({
    name: item.product.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

/** As parcelas como a tela as mostra, mais o que falta pagar e se já quitou. */
function serializeInstallments(installments: InstallmentRow[]) {
  const pending = installments.filter(installment => !installment.paidAt);

  return {
    installments: installments.map(installment => ({
      number: installment.number,
      value: installment.value,
      dueDate: installment.dueDate,
      paidAt: installment.paidAt,
    })),
    pendingAmount: pending.reduce((acc, installment) => acc + installment.value, 0),
    isPaid: installments.length > 0 && pending.length === 0,
  };
}

/**
 * Histórico de compras: os pedidos feitos pela vitrine e, quando existe
 * vínculo com um Customer, também as vendas de balcão dessa mesma pessoa.
 */
export async function orders(req: Request, res: Response) {
  const userId = customerUserId(req);

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { customerId: true },
    });

    if (!user) return res.status(404).json({ error: "Conta não encontrada." });

    // Só o vínculo feito pela loja (ao confirmar um pedido) abre as vendas de
    // balcão. Nunca se deduz do telefone da conta.
    const customerId = user.customerId;

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

    // Compras do cliente vinculado que não vieram por pedido: as vendas de
    // balcão. As que nasceram de um pedido já aparecem na lista acima.
    const orderedSaleIds = orderList.map(order => order.saleId).filter((id): id is number => id !== null);
    const counterSales = customerId === null ? [] : await prisma.sale.findMany({
      where: { customerId, id: { notIn: orderedSaleIds } },
      orderBy: { date: 'desc' },
      take: 100,
      include: {
        items: { include: { product: { select: { name: true } } } },
        installments: { orderBy: { number: 'asc' } },
        coupon: { select: { code: true } },
      },
    });

    const orderEntries = orderList.map(order => ({
      source: 'ORDER' as const,
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
      items: serializeItems(order.items),
      ...serializeInstallments(order.sale?.installments ?? []),
    }));

    const saleEntries = counterSales.map(sale => ({
      source: 'SALE' as const,
      id: sale.id,
      status: 'CONFIRMED' as const,
      createdAt: sale.date,
      cancelReason: null,
      saleId: sale.id,
      total: sale.total,
      discount: sale.discount ?? 0,
      interest: sale.interest ?? 0,
      couponCode: sale.coupon?.code ?? null,
      items: serializeItems(sale.items),
      ...serializeInstallments(sale.installments),
    }));

    const history = [...orderEntries, ...saleEntries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ linkedToCustomer: customerId !== null, orders: history });
  } catch (error) {
    console.error("Erro ao buscar o histórico:", error);
    return res.status(500).json({ error: "Não foi possível carregar seu histórico." });
  }
}
