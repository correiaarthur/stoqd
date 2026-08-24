import bcrypt from 'bcryptjs';

/**
 * A senha do admin sai da comparação em texto puro.
 *
 * O caminho normal é `ADMIN_PASSWORD_HASH` (gere com `npm run hash-password`).
 * Se só existir `ADMIN_PASSWORD`, a senha é convertida em hash uma vez na
 * subida do processo: a comparação já passa a ser bcrypt — de tempo constante,
 * sem vazar por quanto tempo levou — mas a senha ainda está em texto puro no
 * ambiente, e o aviso diz isso.
 */
const BCRYPT_ROUNDS = 12;

let cachedHash: string | null = null;

function resolveHash(): string | null {
  if (cachedHash) return cachedHash;

  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim();

  if (configuredHash) {
    cachedHash = configuredHash;
    return cachedHash;
  }

  const plainPassword = process.env.ADMIN_PASSWORD;

  if (!plainPassword) return null;

  console.warn(
    '[auth] ADMIN_PASSWORD_HASH não definido: usando o hash de ADMIN_PASSWORD gerado na subida. ' +
    'Rode `npm run hash-password` e guarde o resultado em ADMIN_PASSWORD_HASH.'
  );

  cachedHash = bcrypt.hashSync(plainPassword, BCRYPT_ROUNDS);
  return cachedHash;
}

export async function isAdminPassword(password: string): Promise<boolean> {
  const hash = resolveHash();
  if (!hash) return false;

  return bcrypt.compare(password, hash);
}

export function isAdminEmail(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) return false;

  return email.trim().toLowerCase() === adminEmail;
}

export { BCRYPT_ROUNDS };
