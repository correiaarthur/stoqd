/**
 * Roda **antes** de qualquer módulo de `src/` ser carregado.
 *
 * Existe por causa de um erro real: a primeira versão destes testes criava um
 * client próprio apontado para o banco descartável, mas os controllers importam
 * `prisma` de `src/lib/prisma.ts`, que lê `DATABASE_URL` do `.env` — o Supabase
 * de produção. O teste consultou o banco real. Não escreveu nada por sorte (o
 * `findUnique` não achou o pedido e a transação voltou atrás), e não é em sorte
 * que se apoia um teste que trunca tabelas.
 *
 * A correção é apontar o **mesmo** client para o banco de teste, em vez de ter
 * dois: `DATABASE_URL` é sobrescrito aqui, antes de `prisma.ts` ser avaliado.
 * `dotenv/config`, lá dentro, não sobrescreve variável já definida — então o
 * valor posto aqui vence.
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:test@localhost:5433/stoqd_test';

const URL_PRODUCAO = process.env.DATABASE_URL;

function exigirBancoDescartavel(url: string) {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`TEST_DATABASE_URL não é uma URL válida: ${url}`);
  }

  const local = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'];

  if (!local.includes(host)) {
    throw new Error(
      `TEST_DATABASE_URL aponta para "${host}", que não é local.\n` +
      `Os testes de integração truncam todas as tabelas. Rodar isso contra um ` +
      `banco remoto apagaria dados reais. Abortando.`
    );
  }

  if (/supabase|amazonaws|neon\.tech|railway|render|\.cloud/i.test(url)) {
    throw new Error(`TEST_DATABASE_URL parece ser um banco gerenciado: ${host}. Abortando.`);
  }

  if (URL_PRODUCAO && URL_PRODUCAO === url) {
    throw new Error(
      'TEST_DATABASE_URL é idêntica à DATABASE_URL do .env. ' +
      'O banco de teste precisa ser outro. Abortando.'
    );
  }
}

exigirBancoDescartavel(TEST_DATABASE_URL);

// A troca que faz os controllers falarem com o banco descartável.
process.env.DATABASE_URL = TEST_DATABASE_URL;
