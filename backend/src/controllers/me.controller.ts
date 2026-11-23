import type { Request, Response } from 'express';

import { respondWithError } from '../lib/errors.js';
import { parseWith } from '../lib/validate.js';
import { accountSchema, changePasswordSchema } from '../lib/validation.js';
import { customerUserId } from '../middlewares/auth.js';
import {
  changeAccountPassword,
  deleteAccount,
  getAccount,
  getPurchaseHistory,
  updateAccount,
} from '../services/account.service.js';

/**
 * A área do cliente: só o HTTP. Ler a requisição, chamar o service e responder — a
 * regra está em `services/account.service.ts`.
 */

export async function show(req: Request, res: Response) {
  try {
    return res.json(await getAccount(customerUserId(req)));
  } catch (error) {
    return respondWithError(res, error, "Não foi possível carregar sua conta.");
  }
}

export async function update(req: Request, res: Response) {
  const parsed = parseWith(accountSchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    return res.json(await updateAccount(customerUserId(req), parsed.data));
  } catch (error) {
    return respondWithError(res, error, "Não foi possível salvar suas alterações.");
  }
}

export async function changePassword(req: Request, res: Response) {
  const parsed = parseWith(changePasswordSchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    return res.json(await changeAccountPassword(customerUserId(req), parsed.data));
  } catch (error) {
    return respondWithError(res, error, "Não foi possível trocar a senha.");
  }
}

export async function remove(req: Request, res: Response) {
  try {
    await deleteAccount(customerUserId(req));

    return res.status(204).send();
  } catch (error) {
    return respondWithError(res, error, "Não foi possível excluir sua conta.");
  }
}

export async function orders(req: Request, res: Response) {
  try {
    return res.json(await getPurchaseHistory(customerUserId(req)));
  } catch (error) {
    return respondWithError(res, error, "Não foi possível carregar seu histórico.");
  }
}
