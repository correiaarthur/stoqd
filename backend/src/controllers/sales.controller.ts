import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { getActivePrice } from '../lib/pricing.js';

// Regra de negócio que o operador precisa ler na tela, e não um erro interno.
class SaleError extends Error {}

export async function create(req: Request, res: Response) { 
  const { customerId, items, installmentsCount = 1, observation, discount = 0, paymentType = 'VISTA' } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "A venda precisa ter pelo menos um item." });
  }

  // Quantidade negativa passaria na checagem de estoque, aumentaria o estoque no
  // decremento e reduziria o total da venda.
  const parsedItems: Array<{ productId: number; quantity: number }> = [];
  const seenProducts = new Set<number>();

  for (const item of items) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);

    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ error: "Item inválido na venda." });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: "A quantidade de cada item precisa ser um número inteiro maior que zero." });
    }
    if (seenProducts.has(productId)) {
      return res.status(400).json({ error: "O mesmo produto aparece mais de uma vez na venda." });
    }

    seenProducts.add(productId);
    parsedItems.push({ productId, quantity });
  }

  const isPaidUpfront = paymentType !== 'PRAZO';

  if (!isPaidUpfront && !customerId) {
    return res.status(400).json({ error: "Para vender a prazo, selecione um cliente." });
  }

  // À vista é sempre uma parcela só, mesmo que o caixa tenha escolhido um
  // parcelamento antes de voltar para o pagamento à vista.
  const totalInstallments = isPaidUpfront ? 1 : Number(installmentsCount) || 1;

  const discountValue = Number(discount) || 0;

  try {
    const result = await prisma.$transaction(async (tx) => {
      
      let grossTotal = 0;
      const saleItemsData = [];

      for (const item of parsedItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });

        if (!product) throw new SaleError(`Produto ID ${item.productId} não encontrado.`);
        if (product.quantity < item.quantity) {
          throw new SaleError(`Estoque insuficiente para ${product.name}. Restam ${product.quantity}.`);
        }

        const unitPrice = getActivePrice(product);
        grossTotal += unitPrice * item.quantity;

        saleItemsData.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice
        });

        await tx.product.update({
          where: { id: product.id },
          data: { quantity: { decrement: item.quantity } }
        });
      }

      if (discountValue > grossTotal) {
        throw new SaleError("O desconto não pode ser maior que o valor total da venda.");
      }

      const finalTotal = grossTotal - discountValue;

      const installmentsData = [];

      // Divisão em centavos: 10,00 em 3x daria 3,3333… e a soma das parcelas não
      // fecharia com o total. O resto vai para as primeiras parcelas.
      const totalCents = Math.round(finalTotal * 100);
      const baseCents = Math.floor(totalCents / totalInstallments);
      const leftoverCents = totalCents - baseCents * totalInstallments;

      for (let i = 1; i <= totalInstallments; i++) {
        const dueDate = new Date();
        if (!isPaidUpfront) {
           dueDate.setMonth(dueDate.getMonth() + i);
        }

        installmentsData.push({
          number: i,
          value: (baseCents + (i <= leftoverCents ? 1 : 0)) / 100,
          dueDate: dueDate,
          paidAt: isPaidUpfront ? new Date() : null 
        });
      }

      const sale = await tx.sale.create({
        data: {
          total: finalTotal,
          discount: discountValue,
          customerId: customerId ? Number(customerId) : null,
          observation: observation ? String(observation).trim() : null,
          items: { create: saleItemsData },
          installments: { create: installmentsData }
        },
        include: {
          items: true,
          installments: true
        }
      });

      return sale;
    });

    return res.status(201).json(result);

  } catch (error) {
    if (error instanceof SaleError) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Erro inesperado ao realizar venda:", error);
    return res.status(500).json({ error: "Não foi possível registrar a venda. Tente novamente." });
  }
}

const MAX_SALES_PER_PAGE = 200;

export async function list(req: Request, res: Response) {
  const { from, to, customerId, limit } = req.query;

  const dateFilter: { gte?: Date; lte?: Date } = {};

  for (const [key, value] of [['gte', from], ['lte', to]] as const) {
    if (!value) continue;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: "Período inválido." });
    }
    dateFilter[key] = parsed;
  }

  const take = Math.min(Number(limit) || 50, MAX_SALES_PER_PAGE);

  try {
    const sales = await prisma.sale.findMany({
      take,
      orderBy: { date: 'desc' },
      where: {
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        ...(customerId ? { customerId: Number(customerId) } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        items: {
          include: { product: { select: { name: true } } }
        },
        installments: { orderBy: { number: 'asc' } }
      }
    });

    const withStatus = sales.map((sale) => {
      const grossTotal = sale.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
      const pending = sale.installments.filter((i) => !i.paidAt);

      return {
        ...sale,
        grossTotal,
        itemsCount: sale.items.reduce((acc, item) => acc + item.quantity, 0),
        isPaid: pending.length === 0,
        pendingAmount: pending.reduce((acc, i) => acc + i.value, 0),
      };
    });

    return res.json(withStatus);
  } catch (error) {
    console.error("Erro ao buscar vendas:", error);
    return res.status(500).json({ error: "Erro ao buscar vendas." });
  }
}