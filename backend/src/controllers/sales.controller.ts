import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { getActivePrice } from '../lib/pricing.js';

// Regra de negócio que o operador precisa ler na tela, e não um erro interno.
class SaleError extends Error {}

export async function create(req: Request, res: Response) { 
  const { customerId, items, installmentsCount = 1, observation, discount = 0, paymentType = 'VISTA' } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "A venda precisa ter pelo menos um item." });
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

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: Number(item.productId) } });
        
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
      const installmentValue = finalTotal / totalInstallments;

      for (let i = 1; i <= totalInstallments; i++) {
        const dueDate = new Date();
        if (!isPaidUpfront) {
           dueDate.setMonth(dueDate.getMonth() + i);
        }

        installmentsData.push({
          number: i,
          value: installmentValue,
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

export async function getRecent(_req: Request, res: Response) {
  try {
    const sales = await prisma.sale.findMany({
      take: 20,
      orderBy: { date: 'desc' },
      include: {
        customer: { select: { name: true } },
        items: {
          include: { product: { select: { name: true } } }
        },
        installments: true
      }
    });
    return res.json(sales);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar vendas." });
  }
}