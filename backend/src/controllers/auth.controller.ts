import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';

import { prisma } from '../lib/prisma.js';
import { BCRYPT_ROUNDS, isAdminEmail, isAdminPassword } from '../lib/adminCredentials.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import { parseWith } from '../lib/validate.js';
import { duplicateAccountMessage } from '../services/account.service.js';
import { normalizeEmail, normalizePhone, registerSchema } from '../lib/validation.js';
import { signAdminToken, signCustomerToken } from '../lib/tokens.js';

/** Hash válido de uma senha que ninguém conhece, só para igualar o tempo do login. */
const DUMMY_HASH = bcrypt.hashSync('stoqd-dummy-password', BCRYPT_ROUNDS);

export async function register(req: Request, res: Response) {
  const parsed = parseWith(registerSchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const { name, email, phone, password } = parsed.data;

  // O admin não é um User: deixar cadastrar com o e-mail dele criaria uma conta
  // de cliente que responde pelo mesmo endereço no login.
  if (email !== null && isAdminEmail(email)) {
    return res.status(409).json({ error: "Este e-mail já está em uso." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // A conta nasce sem vínculo com nenhum cliente da loja. Ligar pelo telefone
    // digitado seria entregar o histórico de compras de quem tem aquele número a
    // qualquer pessoa que o digite: o telefone não é segredo e não é verificado.
    // O vínculo é decisão da loja, tomada ao confirmar um pedido.
    const { tokenVersion, ...user } = await prisma.user.create({
      data: { name, email, phone, passwordHash },
      select: { id: true, name: true, email: true, phone: true, tokenVersion: true },
    });

    return res.status(201).json({
      user,
      token: signCustomerToken({ id: user.id, tokenVersion }),
    });
  } catch (error) {
    // A constraint violada pode ser a do telefone ou a do e-mail, e a mensagem
    // precisa apontar o campo certo.
    const translated = translatePrismaError(error, {
      duplicate: duplicateAccountMessage(error, "Já existe uma conta com este telefone. Entre com ele ou use outro número."),
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
 * digita nunca vai casar com um telefone. E-mail de cliente não entra: o
 * e-mail dele é opcional e serve para contato, não para acesso.
 */
export async function login(req: Request, res: Response) {
  const identifier = req.body?.identifier ?? req.body?.phone ?? req.body?.email;
  const email = normalizeEmail(identifier);
  const phone = normalizePhone(identifier);
  const password = String(req.body?.password ?? '');

  try {
    // Os dois lados rodam sempre, sem curto-circuito: `&&` só pagaria o bcrypt
    // (~250 ms) quando o e-mail fosse o do admin, e o tempo da resposta
    // entregaria justamente o endereço que a mensagem de erro esconde.
    const [emailIsAdmin, passwordIsAdmin] = [isAdminEmail(email), await isAdminPassword(password)];

    if (emailIsAdmin && passwordIsAdmin) {
      return res.json({
        token: signAdminToken(),
        user: { name: 'Administração', email, role: 'admin' },
      });
    }

    const user = phone ? await prisma.user.findUnique({ where: { phone } }) : null;

    // Sem usuário, compara contra um hash fictício: o custo é o mesmo de uma
    // senha errada para um telefone que existe.
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (user && passwordMatches) {
      return res.json({
        token: signCustomerToken(user),
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: 'customer' },
      });
    }

    // A mensagem segue o que a pessoa digitou — e é a mesma para qualquer
    // e-mail, seja o da administração ou não: dizer "esse e-mail existe" ou
    // "esse não" entregaria o endereço do admin a quem tentar.
    const typedEmail = String(identifier ?? '').includes('@');
    return res.status(401).json({
      error: typedEmail
        ? "E-mail ou senha incorretos. Clientes entram pelo telefone."
        : "Telefone ou senha incorretos.",
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ error: "Não foi possível entrar. Tente novamente." });
  }
}
