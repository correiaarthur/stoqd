import type { Request, Response } from 'express';

import { respondWithError } from '../lib/errors.js';
import { parseOrderCancel, parseOrderConfirm, parseOrderCreate, parseOrderListQuery } from '../lib/orderInput.js';
import { parseId } from '../lib/validation.js';
import { customerUserId } from '../middlewares/auth.js';
import { cancelOrder, confirmOrder, createOrder, listOrders } from '../services/orders.service.js';

/**
 * Pedidos: só o HTTP. Ler a requisição, chamar o service e responder — a regra
 * está em `services/orders.service.ts`.
 */

/** O cliente envia o carrinho como pedido pendente. */
export async function create(req: Request, res: Response) {
  const userId = customerUserId(req);

  const parsed = parseOrderCreate(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    return res.status(201).json(await createOrder(userId, parsed.data));
  } catch (error) {
    return respondWithError(res, error, "Não foi possível enviar o pedido. Tente novamente.");
  }
}

/** A loja vê os pedidos, com o preço do pedido e o de hoje lado a lado. */
export async function list(req: Request, res: Response) {
  const query = parseOrderListQuery(req.query);
  if (!query.ok) return res.status(400).json({ error: query.error });

  try {
    return res.json(await listOrders(query.data.status));
  } catch (error) {
    return respondWithError(res, error, "Erro ao buscar pedidos.");
  }
}

/** A loja confirma o pedido, e ele vira venda. */
export async function confirm(req: Request, res: Response) {
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(400).json({ error: "Pedido inválido." });

  const body = parseOrderConfirm(req.body);
  if (!body.ok) return res.status(400).json({ error: body.error });

  try {
    return res.json(await confirmOrder(orderId, body.data));
  } catch (error) {
    return respondWithError(res, error, "Não foi possível confirmar o pedido.");
  }
}

/** A loja recusa o pedido, com o motivo que o cliente vai ler. */
export async function cancel(req: Request, res: Response) {
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(400).json({ error: "Pedido inválido." });

  const body = parseOrderCancel(req.body);
  if (!body.ok) return res.status(400).json({ error: body.error });

  try {
    return res.json(await cancelOrder(orderId, body.data.reason));
  } catch (error) {
    return respondWithError(res, error, "Não foi possível recusar o pedido.");
  }
}
