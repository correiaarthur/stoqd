import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import { parseCustomerBody, parseId } from '../lib/validation.js';

// A lista de clientes precisa de dívida, compras em aberto e atraso — não do
// histórico inteiro. Carregar os itens de todas as vendas de todos os clientes
// fazia a resposta crescer sem limite. O histórico vem por getStatement.
export async function getAll(_req: Request, res: Response) {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        sales: {
          select: {
            installments: { select: { value: true, paidAt: true, dueDate: true } }
          }
        }
      }
    });

    const now = new Date();

    const formattedCustomers = customers.map(({ sales, ...customer }) => {
      let totalDebt = 0;
      let pendingSalesCount = 0;
      let hasOverdue = false;

      sales.forEach(sale => {
        const pending = sale.installments.filter(i => !i.paidAt);
        if (pending.length === 0) return;

        pendingSalesCount += 1;
        pending.forEach(installment => {
          totalDebt += installment.value;
          if (installment.dueDate < now) hasOverdue = true;
        });
      });

      return { ...customer, totalDebt, pendingSalesCount, hasOverdue };
    });

    return res.json(formattedCustomers);
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return res.status(500).json({ error: "Erro ao buscar clientes" });
  }
}

export async function getStatement(req: Request, res: Response) {
  const customerId = parseId(req.params.id);

  if (customerId === null) {
    return res.status(400).json({ error: "Cliente inválido." });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        sales: {
          orderBy: { date: 'desc' },
          include: {
            installments: { orderBy: { number: 'asc' } },
            items: { include: { product: { select: { name: true } } } }
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    return res.json(customer);
  } catch (error) {
    console.error("Erro ao buscar o histórico do cliente:", error);
    return res.status(500).json({ error: "Erro ao buscar o histórico do cliente." });
  }
}

export async function create(req: Request, res: Response) {
  const parsed = parseCustomerBody(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const customer = await prisma.customer.create({ data: parsed.data });
    return res.status(201).json(customer);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao criar cliente" });
  }
}

export async function update(req: Request, res: Response) {
  const customerId = parseId(req.params.id);
  if (customerId === null) return res.status(400).json({ error: "Cliente inválido." });

  const parsed = parseCustomerBody(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const existingCustomer = await prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: parsed.data
    });

    return res.json(updatedCustomer);
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error);
    return res.status(500).json({ error: "Erro interno ao atualizar cliente." });
  }
}

/**
 * Apaga um cliente — só quem nunca comprou.
 *
 * A venda é registro de faturamento, não detalhe do cadastro: ela entra no
 * Dashboard, no relatório e na dívida em aberto. Deixar apagar um cliente com
 * histórico é deixar o operador apagar o próprio faturamento por engano, e foi
 * exatamente o que acontecia enquanto a FK estava em CASCADE.
 *
 * A FK hoje é SET NULL, então nem o pior caminho destrói venda. A recusa aqui
 * existe porque uma venda sem cliente também é perda: a dívida em aberto deixa
 * de ter a quem cobrar. Melhor dizer não e explicar por quê.
 */
export async function remove(req: Request, res: Response) {
  const customerId = parseId(req.params.id);

  if (customerId === null) {
    return res.status(400).json({ error: "Cliente inválido." });
  }

  try {
    const salesCount = await prisma.sale.count({ where: { customerId } });

    if (salesCount > 0) {
      const openInstallments = await prisma.installment.count({
        where: { sale: { customerId }, paidAt: null },
      });

      // O motivo muda o que a pessoa faz a seguir: com parcela em aberto há
      // dinheiro a receber, e aí apagar seria abrir mão da cobrança.
      const reason = openInstallments > 0
        ? `tem ${openInstallments} ${openInstallments === 1 ? 'parcela' : 'parcelas'} em aberto`
        : `tem ${salesCount} ${salesCount === 1 ? 'venda registrada' : 'vendas registradas'}`;

      return res.status(409).json({
        error: `Este cliente ${reason} e não pode ser apagado — o histórico de vendas depende do cadastro. Para corrigir os dados da pessoa, use Editar.`,
      });
    }

    await prisma.customer.delete({
      where: { id: customerId }
    });

    return res.status(204).send();
  } catch (error) {
    const translated = translatePrismaError(error, { notFound: "Cliente não encontrado." });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao deletar cliente:", error);
    return res.status(500).json({ error: "Erro interno ao excluir cliente." });
  }
}