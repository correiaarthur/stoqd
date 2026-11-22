import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'admin' | 'customer';

export type AuthPayload = {
  role: Role;
  /** Só existe em token de cliente: o admin não tem linha na tabela User. */
  userId?: number | undefined;
};

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
 * Verifica a assinatura e anexa o papel em `req.auth`.
 *
 * Autenticar não é autorizar: a partir do momento em que clientes recebem token
 * assinado com o mesmo segredo do admin, deixar uma rota só com este middleware
 * é o mesmo que abri-la para qualquer pessoa cadastrada. Toda rota protegida
 * precisa vir seguida de `requireAdmin` ou `requireCustomer`.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): Response | void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido. Acesso negado." });
  }

  const token = readToken(req);

  if (!token) {
    return res.status(401).json({ error: "Token malformado ou ausente. Acesso negado." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: ['HS256'] }) as jwt.JwtPayload;

    // Token emitido antes de existirem papéis não vira admin por omissão.
    const role = payload.role === 'admin' || payload.role === 'customer' ? payload.role : null;

    if (!role) {
      return res.status(401).json({ error: "Token sem papel definido. Faça login novamente." });
    }

    req.auth = { role, userId: typeof payload.userId === 'number' ? payload.userId : undefined };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido ou expirado. Faça login novamente." });
  }
}

/** Autentica se houver token, mas deixa passar quem não mandou nenhum. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (payload.role === 'admin' || payload.role === 'customer') {
      req.auth = { role: payload.role, userId: typeof payload.userId === 'number' ? payload.userId : undefined };
    }
  } catch {
    // Token ruim numa rota pública é o mesmo que token nenhum.
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
