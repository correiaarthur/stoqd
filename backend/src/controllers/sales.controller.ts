import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { parseCartItems } from '../lib/cartItems.js';
import { MAX_LINES_PER_CART, MAX_UNITS_PER_CART } from '../lib/availability.js';
import { SaleError, registerSale } from '../lib/sales.js';
import { respondWithError } from '../lib/errors.js';
import { checkCoupon } from '../lib/coupons.js';
import { PRODUCT_PRICING_SELECT, getActivePrice } from '../lib/pricing.js';
import { sumLines } from '../lib/pricingRules.js';

export async function create(req: Request, res: Response) {
  const { customerId, items, installmentsCount = 1, observation, discount = 0, paymentType = 'VISTA' } = req.body;

  const parsed = parseCartItems(items, { maxLines: MAX_LINES_PER_CART, maxUnits: MAX_UNITS_PER_CART });

  if (!parsed.ok) {
    // "O carrinho está vazio" não é a frase certa para uma venda de balcão.
    const message = parsed.error === "O carrinho está vazio."
      ? "A venda precisa ter pelo menos um item."
      : parsed.error;
    return res.status(400).json({ error: message });
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      // O cupom é conferido contra o subtotal real dos produtos no banco, não
      // contra um total que veio do corpo da requisição.
      const coupon = req.body?.couponCode
        ? await resolveCoupon(tx, req.body.couponCode, parsed.items)
        : null;

      return registerSale(tx, {
        customerId: customerId ? Number(customerId) : null,
        // O `unitPrice` que vem do corpo é ignorado de propósito: quem define o
        // preço é o produto no banco, não quem chama a API.
        items: parsed.items,
        discount: Number(discount) || 0,
        installmentsCount,
        paymentType,
        observation: observation ? String(observation).trim() : null,
        coupon,
      });
    });

    return res.status(201).json(sale);
  } catch (error) {
    return respondWithError(res, error, "Não foi possível registrar a venda. Tente novamente.");
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
        installments: { orderBy: { number: 'asc' } },
        order: { select: { id: true } },
        coupon: { select: { code: true } },
      }
    });

    const withStatus = sales.map((sale) => {
      const grossTotal = sumLines(sale.items);
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


/** Subtotal a partir do banco — nunca a partir do que o cliente mandou. */
export async function subtotalFor(
  tx: Parameters<typeof registerSale>[0],
  items: Array<{ productId: number; quantity: number }>
) {
  const products = await tx.product.findMany({
    where: { id: { in: items.map(item => item.productId) } },
    select: PRODUCT_PRICING_SELECT,
  });

  const priceById = new Map(products.map(product => [product.id, getActivePrice(product)]));

  return sumLines(items.map(item => ({ quantity: item.quantity, unitPrice: priceById.get(item.productId) ?? 0 })));
}

async function resolveCoupon(
  tx: Parameters<typeof registerSale>[0],
  code: unknown,
  items: Array<{ productId: number; quantity: number }>
) {
  const subtotal = await subtotalFor(tx, items);
  const result = await checkCoupon(tx, code, subtotal);

  if (!result.ok) throw new SaleError(result.message);

  return { id: result.couponId, discount: result.discount };
}
