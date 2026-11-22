import type { NextFunction, Request, Response } from 'express';

import { isProduction } from '../lib/env.js';

/** Rota que não existe: JSON, no mesmo formato dos outros erros da API. */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Rota não encontrada." });
}

/**
 * Rede de segurança para o que escapa dos `try/catch` dos controllers — no
 * Express 5 uma rejeição em handler assíncrono chega aqui em vez de derrubar o
 * processo. O caso mais comum é um corpo JSON malformado, que sem isto
 * devolveria uma página HTML com o stack trace.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  const status = typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : 500;

  if (status >= 400 && status < 500) {
    const message = status === 413 ? "Corpo da requisição grande demais." : "Requisição inválida.";
    return res.status(status).json({ error: message });
  }

  console.error("Erro não tratado:", isProduction ? (err as Error)?.message : err);
  return res.status(500).json({ error: "Erro interno do servidor." });
}
