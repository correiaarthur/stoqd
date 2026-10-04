import { execSync } from 'node:child_process';

import { prisma } from '../../src/lib/prisma.js';

/**
 * O banco descartável dos testes de integração.
 *
 * **Um client só.** Este módulo reexporta o `prisma` da aplicação em vez de
 * criar outro: é o mesmo client que os controllers usam, apontado para o banco
 * de teste por `setupIntegration.ts`, que roda antes de qualquer import de
 * `src/`. Dois clients foi a primeira tentativa e estava errada — o teste
 * escrevia num banco e o controller lia de outro.
 *
 * Subir o banco:
 *   docker run -d --name stoqd-test -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=stoqd_test -p 5433:5432 postgres:16-alpine
 */

/** Nome antigo mantido para os testes lerem como "o banco de teste". */
export const testPrisma = prisma;

/** A URL que `setupIntegration.ts` já validou como local. */
function urlDoBancoDeTeste() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL vazia. setupIntegration.ts rodou?');
  }

  // Segunda barreira: se por algum caminho o setup não tiver rodado, nada aqui
  // deve tocar num banco remoto.
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(host)) {
    throw new Error(`Recusando operar em "${host}": não é um banco local.`);
  }

  return url;
}

/**
 * Aplica o schema no banco de teste.
 *
 * `migrate deploy` e não `db push`: o que se quer testar é o schema que vai para
 * produção, com as mesmas FKs e os mesmos `ON DELETE`. Foi exatamente uma FK
 * divergente (`Sale.customerId` em CASCADE) que apagava venda ao remover
 * cliente — um `db push` poderia esconder esse tipo de diferença.
 */
export function aplicarMigrations() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: urlDoBancoDeTeste() },
    stdio: 'pipe',
  });
}

/** Tabelas na ordem em que podem ser esvaziadas sem brigar com as FKs. */
const TABELAS = [
  'Reservation', 'OrderItem', 'Order', 'Installment', 'SaleItem', 'Sale',
  'User', 'Customer', 'Product', 'Coupon', 'Category', 'Brand',
];

/**
 * Esvazia tudo entre testes.
 *
 * `TRUNCATE ... RESTART IDENTITY CASCADE` em vez de `deleteMany`: devolve os ids
 * ao início, então um teste não depende do id que o anterior deixou.
 *
 * `InstallmentPlan` fica de fora de propósito — são as taxas de parcelamento,
 * configuração semeada pelas migrations, não dado de teste.
 */
export async function limparBanco() {
  urlDoBancoDeTeste();

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABELAS.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
}

export async function fecharBanco() {
  await prisma.$disconnect();
}
