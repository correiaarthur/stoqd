import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { prisma } from '../lib/prisma.js';
import { BCRYPT_ROUNDS, isAdminEmail, isAdminPassword } from '../lib/adminCredentials.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import {
  normalizeEmail,
  normalizeName,
  normalizePhone,
  optionalEmail,
  validateAccountFields,
  validatePassword,
} from '../lib/validation.js';
import type { Role } from '../middlewares/auth.js';

const TOKEN_LIFETIME = '1d';

function signToken(payload: { role: Role; userId?: number }) {
  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: TOKEN_LIFETIME });
}

export async function register(req: Request, res: Response) {
  const name = normalizeName(req.body?.name);
  const email = optionalEmail(req.body?.email);
  const phone = normalizePhone(req.body?.phone);
  const password = req.body?.password;

  const fieldError = validateAccountFields({ name, email, phone });
  if (fieldError) return res.status(400).json({ error: fieldError.error });

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  // O admin não é um User: deixar cadastrar com o e-mail dele criaria uma conta
  // de cliente que responde pelo mesmo endereço no login.
  if (email !== null && isAdminEmail(email)) {
    return res.status(409).json({ error: "Este e-mail já está em uso." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: { name, email, phone, passwordHash },
      select: { id: true, name: true, email: true, phone: true },
    });

    return res.status(201).json({
      user,
      token: signToken({ role: 'customer', userId: user.id }),
    });
  } catch (error) {
    // A constraint violada pode ser a do telefone ou a do e-mail; o Prisma diz
    // qual em `meta.target`, e a mensagem precisa apontar o campo certo.
    const duplicatedField = (error as { meta?: { target?: string[] } })?.meta?.target ?? [];

    const translated = translatePrismaError(error, {
      duplicate: duplicatedField.includes('email')
        ? "Este e-mail já está em uso."
        : "Já existe uma conta com este telefone. Entre com ele ou use outro número.",
    });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao cadastrar cliente:", error);
    return res.status(500).json({ error: "Não foi possível criar a conta. Tente novamente." });
  }
}

/**
 * Um campo só de identificação, dois tipos de conta.
 *
 * O cliente entra pelo telefone — é o dado que ele tem sempre à mão, e o mesmo
 * que a loja usa para falar com ele. A administração entra pelo e-mail do
 * `.env`, que não é um `User`. Por isso o admin é testado primeiro: o que ele
 * digita nunca vai casar com um telefone.
 */
export async function login(req: Request, res: Response) {
  const identifier = req.body?.identifier ?? req.body?.phone ?? req.body?.email;
  const email = normalizeEmail(identifier);
  const phone = normalizePhone(identifier);
  const password = String(req.body?.password ?? '');

  try {
    if (isAdminEmail(email) && await isAdminPassword(password)) {
      return res.json({
        token: signToken({ role: 'admin' }),
        user: { name: 'Administração', email, role: 'admin' },
      });
    }

    const user = phone ? await prisma.user.findUnique({ where: { phone } }) : null;

    if (user && await bcrypt.compare(password, user.passwordHash)) {
      return res.json({
        token: signToken({ role: 'customer', userId: user.id }),
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: 'customer' },
      });
    }

    return res.status(401).json({ error: "Telefone ou senha incorretos." });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ error: "Não foi possível entrar. Tente novamente." });
  }
}
