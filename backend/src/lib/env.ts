import 'dotenv/config';

/**
 * Confere o ambiente antes de o servidor aceitar a primeira requisição.
 *
 * Sem esta checagem o processo sobe alegremente sem `JWT_SECRET` e só falha na
 * hora de assinar um token — o login devolve 500 e o erro real fica escondido
 * atrás de "Não foi possível entrar". O mesmo vale para `DATABASE_URL`: a
 * conexão só é tentada na primeira consulta.
 *
 * Faltando algo obrigatório, o processo morre aqui, com a lista do que falta.
 * Um servidor que não sobe é um problema óbvio; um que sobe quebrado, não.
 */

const isProduction = process.env.NODE_ENV === 'production';

/** Obrigatórias sempre — sem elas nada funciona, nem em desenvolvimento. */
const ALWAYS_REQUIRED = [
  ['DATABASE_URL', 'conexão com o Postgres'],
  ['JWT_SECRET', 'segredo de assinatura do token'],
  ['ADMIN_EMAIL', 'e-mail de acesso da administração'],
] as const;

function isBlank(name: string): boolean {
  return !process.env[name]?.trim();
}

export function assertEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const [name, description] of ALWAYS_REQUIRED) {
    if (isBlank(name)) missing.push(`${name} — ${description}`);
  }

  // Dois caminhos válidos para a senha do admin, mas pelo menos um precisa
  // existir: sem nenhum, `isAdminPassword` recusa tudo e ninguém entra.
  if (isBlank('ADMIN_PASSWORD_HASH') && isBlank('ADMIN_PASSWORD')) {
    missing.push('ADMIN_PASSWORD_HASH — hash da senha do admin (gere com `npm run hash-password`)');
  }

  // Em produção, um segredo curto é o mesmo que segredo nenhum: quem o
  // adivinha forja token de admin.
  const jwtSecret = process.env.JWT_SECRET?.trim() ?? '';

  if (isProduction && jwtSecret.length > 0 && jwtSecret.length < 32) {
    missing.push('JWT_SECRET — precisa de pelo menos 32 caracteres em produção');
  }

  // Estas não impedem o servidor de subir, mas mudam o comportamento de um
  // jeito que ninguém quer descobrir depois.
  if (isProduction && isBlank('CORS_ORIGINS')) {
    warnings.push('CORS_ORIGINS não definido: a API vai aceitar qualquer origem.');
  }

  if (isProduction && isBlank('ADMIN_PASSWORD_HASH')) {
    warnings.push('ADMIN_PASSWORD_HASH não definido: a senha do admin está em texto puro no ambiente.');
  }

  for (const warning of warnings) {
    console.warn(`[env] ${warning}`);
  }

  if (missing.length > 0) {
    console.error(
      '\n[env] O servidor não pode subir — falta configurar:\n\n' +
      missing.map(item => `  • ${item}`).join('\n') +
      '\n\nVeja `backend/.env.example` para o que cada variável significa.\n'
    );
    process.exit(1);
  }
}

export { isProduction };
