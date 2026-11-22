import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { getActivePrice } from '../lib/pricing.js';
import { parseCartItems, parseCartToken } from '../lib/cartItems.js';
import {
  ANONYMOUS_RESERVATION_MINUTES,
  IDENTIFIED_RESERVATION_MINUTES,
  MAX_LINES_PER_CART,
  MAX_UNITS_PER_CART,
  getStockView,
  loadStockProducts,
  purgeExpiredReservationsThrottled,
  reservationExpiry,
} from '../lib/availability.js';

const LIMITS = { maxLines: MAX_LINES_PER_CART, maxUnits: MAX_UNITS_PER_CART };

type ItemStatus = {
  productId: number;
  name: string;
  requested: number;
  /** Quanto coube de fato — pode ser menos que o pedido, ou zero. */
  reserved: number;
  available: number;
  unitPrice: number;
  status: 'ok' | 'partial' | 'unavailable';
};

/**
 * Troca as reservas deste carrinho pelas do estado atual dele.
 *
 * Reservar é sempre substituir, nunca somar: o carrinho manda a lista inteira
 * e o servidor faz a linha bater. Assim mexer no carrinho dez vezes não deixa
 * dez reservas para trás, e a chamada pode ser repetida sem estragar nada.
 *
 * Quem já entrou ganha 30 minutos em vez de 5 — depois de identificado, a
 * pressa deixa de fazer sentido.
 */
export async function reserve(req: Request, res: Response) {
  const cartToken = parseCartToken(req.body?.cartToken);
  if (!cartToken) return res.status(400).json({ error: "Carrinho inválido." });

  const parsed = parseCartItems(req.body?.items, LIMITS);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const userId = req.auth?.role === 'customer' ? req.auth.userId ?? null : null;
  const minutes = userId ? IDENTIFIED_RESERVATION_MINUTES : ANONYMOUS_RESERVATION_MINUTES;
  const expiresAt = reservationExpiry(minutes);

  try {
    const { products, byId: productById } = await loadStockProducts(parsed.items.map(item => item.productId));

    const result = await prisma.$transaction(async (tx) => {
      // As reservas antigas deste carrinho saem antes da contagem, senão o
      // carrinho competiria consigo mesmo pela última unidade.
      await tx.reservation.deleteMany({ where: { cartToken, orderId: null } });

      const stock = await getStockView(products, { tx });

      const items: ItemStatus[] = [];
      const toCreate: Array<{ productId: number; quantity: number }> = [];

      for (const item of parsed.items) {
        const product = productById.get(item.productId);
        if (!product) continue;

        const available = stock.get(product.id)?.available ?? 0;
        const granted = Math.min(item.quantity, available);

        if (granted > 0) {
          toCreate.push({ productId: product.id, quantity: granted });
        }

        items.push({
          productId: product.id,
          name: product.name,
          requested: item.quantity,
          reserved: granted,
          available,
          unitPrice: getActivePrice(product),
          status: granted === item.quantity ? 'ok' : granted === 0 ? 'unavailable' : 'partial',
        });
      }

      if (toCreate.length > 0) {
        await tx.reservation.createMany({
          data: toCreate.map(item => ({ ...item, cartToken, userId, expiresAt })),
        });
      }

      return items;
    });

    // Depois da resposta decidida e sem esperar: é faxina, não parte da reserva.
    void purgeExpiredReservationsThrottled();

    const anyReserved = result.some(item => item.reserved > 0);

    return res.json({
      expiresAt: anyReserved ? expiresAt.toISOString() : null,
      minutes,
      items: result,
    });
  } catch (error) {
    console.error("Erro ao reservar itens do carrinho:", error);
    return res.status(500).json({ error: "Não foi possível reservar os itens. Tente novamente." });
  }
}

/**
 * Disponibilidade atual dos itens do carrinho, sem reservar nada.
 *
 * É o que responde ao caso do visitante que ignorou os 5 minutos e voltou meia
 * hora depois: o carrinho continua no navegador, a reserva não. A tela usa
 * isto para marcar o que não cabe mais antes de deixar finalizar.
 */
export async function availability(req: Request, res: Response) {
  const cartToken = parseCartToken(req.body?.cartToken);

  const parsed = parseCartItems(req.body?.items, LIMITS);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const { products, byId: productById } = await loadStockProducts(parsed.items.map(item => item.productId));

    // A reserva do próprio carrinho não conta contra ele.
    const stock = await getStockView(products, cartToken ? { excludeCartToken: cartToken } : {});

    const items = parsed.items.map(item => {
      const product = productById.get(item.productId);

      if (!product) {
        return {
          productId: item.productId,
          name: 'Produto removido',
          requested: item.quantity,
          available: 0,
          quantity: 0,
          reserved: 0,
          unitPrice: 0,
          status: 'gone' as const,
        };
      }

      const view = stock.get(product.id);
      const available = view?.available ?? 0;

      return {
        productId: product.id,
        name: product.name,
        requested: item.quantity,
        available,
        // O físico vai junto porque o balcão vende o que está na prateleira,
        // reservado ou não (decisão D2). Quem atende precisa dos dois números:
        // "1 un · 1 reservada" avisa sem impedir.
        quantity: view?.quantity ?? 0,
        reserved: view?.reserved ?? 0,
        unitPrice: getActivePrice(product),
        status: available >= item.quantity ? 'ok' : available === 0 ? 'unavailable' : 'partial',
      };
    });

    const activeReservation = cartToken
      ? await prisma.reservation.findFirst({
          where: { cartToken, orderId: null, expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: 'desc' },
          select: { expiresAt: true },
        })
      : null;

    return res.json({
      expiresAt: activeReservation?.expiresAt.toISOString() ?? null,
      items,
    });
  } catch (error) {
    console.error("Erro ao consultar disponibilidade:", error);
    return res.status(500).json({ error: "Não foi possível conferir o estoque. Tente novamente." });
  }
}

/** Solta as reservas de um carrinho — usado ao esvaziar o carrinho na tela. */
export async function release(req: Request, res: Response) {
  const cartToken = parseCartToken(req.body?.cartToken);
  if (!cartToken) return res.status(400).json({ error: "Carrinho inválido." });

  try {
    await prisma.reservation.deleteMany({ where: { cartToken, orderId: null } });
    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao liberar reservas:", error);
    return res.status(500).json({ error: "Não foi possível liberar as reservas." });
  }
}
