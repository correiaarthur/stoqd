import { defineConfig } from 'vitest/config';

/**
 * Duas classes de teste, separadas por diretório e por custo.
 *
 * O critério não é "unitário × integração", é **precisa de algo fora do
 * processo?**. Um teste que exercita três funções juntas em memória continua
 * sendo do módulo; um que precisa de Postgres ou de subir o Express sai dele.
 * Regra de bolso: se importa `tests/helpers/testDb`, mora em `tests/`.
 *
 * A separação é por pasta e não por nome de arquivo porque `npm test` precisa
 * continuar sendo o comando que se roda a cada mudança — hoje, meio segundo.
 * Convenção de nome (`*.int.test.ts`) daria o mesmo resultado e seria mais
 * fácil de esquecer.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          // Junto do módulo que exercitam: abrir `src/controllers/` e não ver
          // uma pasta `tests/` é o próprio aviso de que falta cobertura.
          include: ['src/**/tests/**/*.test.ts'],
          globals: false,
        },
      },
      {
        test: {
          name: 'integration',
          // Fora de `src` porque não têm um módulo dono: concorrência cruza
          // `lib/sales.ts`, Prisma e transação; autorização cruza rota e
          // middleware. Exigem um Postgres descartável.
          include: ['tests/integration/**/*.test.ts'],
          globals: false,
          // Roda antes de qualquer módulo de `src/` ser avaliado, e é o que
          // aponta o client da aplicação para o banco descartável. Sem isto os
          // controllers falam com o `DATABASE_URL` do .env — produção.
          setupFiles: ['./tests/helpers/setupIntegration.ts'],
          // Um banco, um arquivo por vez. Em paralelo, dois arquivos dão
          // TRUNCATE nas mesmas tabelas e o Postgres aborta com deadlock —
          // aconteceu na primeira execução. Testar concorrência de verdade é o
          // trabalho de `Promise.allSettled` dentro do teste, não do runner.
          fileParallelism: false,
          // Transação com cinco vendas disputando a mesma linha espera lock;
          // os 5s padrão ficam curtos quando o banco sobe junto.
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
