import { createHmac, timingSafeEqual } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { prisma } from './prisma.js';

/**
 * Emitir e verificar o token de sessão — e poder **revogá-lo**.
 *
 * Um JWT assinado vale até expirar: sem mais nada, a senha trocada ou a conta
 * apagada não derrubavam a sessão de quem já tinha um token (ou de quem o roubou)
 * por até um dia. Aqui o token carrega um marcador do estado em que foi emitido, e
 * o servidor só o aceita se esse estado continua o mesmo:
 *
 *  - **cliente:** `tv`, a versão da sessão (`User.tokenVersion`). Trocar a senha
 *    incrementa; apagar a conta apaga a linha. Custa uma leitura por chave
 *    primária a cada requisição autenticada.
 *  - **admin:** `cf`, uma impressão digital das credenciais do `.env`. O admin não
 *    tem linha no banco, então a revogação vem de a credencial mudar: trocar a
 *    senha (ou o e-mail) do admin derruba as sessões antigas, sem tabela nem
 *    variável nova.
 */

export type Role = 'admin' | 'customer';

export type AuthPayload = {
  role: Role;
  /** Só existe em token de cliente: o admin não tem linha na tabela User. */
  userId?: number | undefined;
};

export const TOKEN_LIFETIME = '1d';

const secret = () => process.env.JWT_SECRET as string;

/**
 * A impressão digital das credenciais do admin.
 *
 * Do hash do `.env` quando existe; senão da senha em texto — **não** do hash que
 * `adminCredentials` gera na subida a partir dela, que leva sal novo a cada
 * reinício e derrubaria a sessão do admin a cada deploy. É um HMAC com o segredo
 * do JWT: o token carrega só a impressão, nunca a credencial.
 */
export function adminCredentialFingerprint(): string {
  const credential = process.env.ADMIN_PASSWORD_HASH?.trim() || process.env.ADMIN_PASSWORD || '';
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';

  return createHmac('sha256', secret()).update(`${email}\0${credential}`).digest('hex').slice(0, 32);
}

const sign = (payload: Record<string, unknown>) =>
  jwt.sign(payload, secret(), { algorithm: 'HS256', expiresIn: TOKEN_LIFETIME });

export function signAdminToken(): string {
  return sign({ role: 'admin', cf: adminCredentialFingerprint() });
}

export function signCustomerToken(user: { id: number; tokenVersion: number }): string {
  return sign({ role: 'customer', userId: user.id, tv: user.tokenVersion });
}

export type VerifyResult = { ok: true; auth: AuthPayload } | { ok: false; error: string };

const SESSION_ENDED = "Sessão encerrada. Faça login novamente.";

function sameFingerprint(received: unknown, expected: string): boolean {
  if (typeof received !== 'string') return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Confere assinatura, papel e — o que torna o token revogável — se o estado
 * guardado nele ainda é o de agora.
 */
export async function verifyAuthToken(token: string): Promise<VerifyResult> {
  let payload: jwt.JwtPayload;

  try {
    payload = jwt.verify(token, secret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    return { ok: false, error: "Token inválido ou expirado. Faça login novamente." };
  }

  // Token emitido antes de existirem papéis não vira admin por omissão.
  if (payload.role !== 'admin' && payload.role !== 'customer') {
    return { ok: false, error: "Token sem papel definido. Faça login novamente." };
  }

  if (payload.role === 'admin') {
    // Sem impressão (emitido antes da revogação) ou com a de uma credencial que já
    // mudou: recusa. O admin entra de novo; vale a pena para poder revogá-lo.
    return sameFingerprint(payload.cf, adminCredentialFingerprint())
      ? { ok: true, auth: { role: 'admin' } }
      : { ok: false, error: SESSION_ENDED };
  }

  // Cliente sem `userId` passa daqui para `requireCustomer`, que o recusa.
  if (typeof payload.userId !== 'number') return { ok: true, auth: { role: 'customer' } };

  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { tokenVersion: true } });

  // Conta apagada, ou sessão de uma versão que já foi revogada. Token emitido
  // antes de existir `tv` vale como versão 0: ninguém é deslogado no deploy, e a
  // primeira troca de senha já o revoga.
  const issuedVersion = typeof payload.tv === 'number' ? payload.tv : 0;

  if (!user || user.tokenVersion !== issuedVersion) return { ok: false, error: SESSION_ENDED };

  return { ok: true, auth: { role: 'customer', userId: payload.userId } };
}
