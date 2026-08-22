import { type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { getActivePrice } from '../lib/pricing.js';

// Janela de "vencendo em breve". O estoque tem 145 dos 185 produtos com uma
// única unidade, então contar "estoque baixo" não distinguiria nada — o que
// realmente exige ação aqui é validade e ruptura.
const EXPIRY_WARNING_DAYS = 90;

// Uma linha por item vendido, já com o desconto da venda rateado entre os itens.
// O dashboard agrupa e filtra em cima disso.
export async function getSalesReport(req: Request, res: Response) {
  const { from } = req.query;

  let fromDate: Date | undefined;
  if (from) {
    fromDate = new Date(String(from));
    if (Number.isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: "Data inicial inválida." });
    }
  }

  try {
    const sales = await prisma.sale.findMany({
      where: fromDate ? { date: { gte: fromDate } } : {},
      orderBy: { date: 'asc' },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                brand: { select: { name: true } },
                category: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const soldItems = sales.flatMap((sale) => {
      const grossTotal = sale.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
      const discount = sale.discount || 0;

      return sale.items.map((item) => {
        const itemGross = item.unitPrice * item.quantity;
        // Rateio proporcional: um desconto de 10% na venda tira 10% de cada item,
        // senão a receita por marca/categoria não fecha com o total da venda.
        const itemDiscount = grossTotal > 0 ? discount * (itemGross / grossTotal) : 0;

        return {
          saleId: sale.id,
          date: sale.date,
          quantity: item.quantity,
          revenue: itemGross - itemDiscount,
          productName: item.product.name,
          brandName: item.product.brand?.name || 'Sem Marca',
          categoryName: item.product.category?.name || 'Sem Categoria',
        };
      });
    });

    return res.json(soldItems);
  } catch (error) {
    console.error("Erro ao gerar o relatório de vendas:", error);
    return res.status(500).json({ error: "Erro ao gerar o relatório de vendas." });
  }
}

export async function getDashboardSummary(_req: Request, res: Response) {
  try {
    const products = await prisma.product.findMany();
    
    let totalStockValue = 0;
    let totalExpectedProfit = 0;
    let outOfStockItems = 0;
    let expiredItems = 0;
    let expiringSoonItems = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const warningLimit = new Date(today);
    warningLimit.setDate(warningLimit.getDate() + EXPIRY_WARNING_DAYS);

    products.forEach(p => {
      const activePrice = getActivePrice(p);
      totalStockValue += activePrice * p.quantity;
      totalExpectedProfit += (activePrice - p.averageCost) * p.quantity;

      if (p.quantity === 0) outOfStockItems += 1;

      // Vencimento só interessa em item que ainda está em estoque.
      if (p.expiryDate && p.quantity > 0) {
        if (p.expiryDate < today) expiredItems += 1;
        else if (p.expiryDate <= warningLimit) expiringSoonItems += 1;
      }
    });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlySales = await prisma.sale.aggregate({
      where: { date: { gte: startOfMonth } },
      _sum: { total: true },
      _count: { id: true }
    });

    const dashboardData = {
      inventory: {
        totalProducts: products.length,
        totalStockValue,
        totalExpectedProfit,
        outOfStockItems,
        expiredItems,
        expiringSoonItems,
        expiryWarningDays: EXPIRY_WARNING_DAYS
      },
      sales: {
        currentMonthTotal: monthlySales._sum.total || 0,
        currentMonthCount: monthlySales._count.id || 0
      }
    };

    return res.json(dashboardData);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao carregar métricas" });
  }
}