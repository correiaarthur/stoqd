import type { Request, Response, NextFunction } from 'express';

import { verifyAuthToken, type AuthPayload, type Role } from '../lib/tokens.js';

export type { AuthPayload, Role };

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

function readToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [, token] = authHeader.split(' ');
  return token || null;
}

/**
 * Verifica o token e anexa o papel em `req.auth`.
 *
 * Verificar inclui a revogação (`lib/tokens.ts`): um token cuja sessão foi
 * encerrada — senha trocada, conta apagada, credencial do admin mudada — é
 * recusado mesmo com a assinatura certa e dentro da validade.
 *
 * Autenticar não é autorizar: a partir do momento em que clientes recebem token
 * assinado com o mesmo segredo do admin, deixar uma rota só com este middleware
 * é o mesmo que abri-la para qualquer pessoa cadastrada. Toda rota protegida
 * precisa vir seguida de `requireAdmin` ou `requireCustomer`.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: "Token não fornecido. Acesso negado." });
  }

  const token = readToken(req);

  if (!token) {
    return res.status(401).json({ error: "Token malformado ou ausente. Acesso negado." });
  }

  const result = await verifyAuthToken(token);

  if (!result.ok) return res.status(401).json({ error: result.error });

  req.auth = result.auth;
  next();
}

/** Autentica se houver token, mas deixa passar quem não mandou nenhum. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req);

  if (token) {
    try {
      const result = await verifyAuthToken(token);
      if (result.ok) req.auth = result.auth;
    } catch {
      // Token ruim — ou um banco que não respondeu — numa rota pública é o mesmo
      // que token nenhum: a pessoa segue como visitante.
    }
  }

  next();
}

function requireRole(role: Role, message: string) {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    if (req.auth?.role !== role) {
      return res.status(403).json({ error: message });
    }
    next();
  };
}

export const requireAdmin = requireRole('admin', "Esta área é da administração da loja.");

const requireCustomerRole = requireRole('customer', "Esta área é da sua conta de cliente.");

/**
 * Exige token de cliente **com** `userId`. Quem passa por aqui pode usar
 * `customerUserId(req)` sem checar nada: a verificação mora num lugar só, em
 * vez de um `if (!userId)` no começo de cada handler.
 */
export function requireCustomer(req: Request, res: Response, next: NextFunction): Response | void {
  requireCustomerRole(req, res, (err?: unknown) => {
    if (err) return next(err);

    if (req.auth?.userId === undefined) {
      return res.status(401).json({ error: "Faça login novamente." });
    }

    next();
  });
}

/** `userId` do cliente autenticado. Só chamar depois de `requireCustomer`. */
export function customerUserId(req: Request): number {
  return req.auth?.userId as number;
}

/** Autentica e exige papel de admin: o par que toda rota da administração precisa. */
export const adminOnly = [authMiddleware, requireAdmin];
