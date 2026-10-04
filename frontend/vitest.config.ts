import { defineConfig } from 'vitest/config';

/**
 * Mesma divisão do backend: pasta `tests` dentro de cada módulo para o que roda
 * em memória, `tests/` na raiz para o que precisa de navegador.
 *
 * Hoje só o projeto `unit` tem conteúdo. Componente e hook pedem jsdom e
 * testing-library — e fazem mais sentido depois que Checkout (698 linhas),
 * Dashboard e Settings estiverem quebrados em pedaços testáveis. O e2e
 * (Playwright) moraria em `tests/e2e/`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/tests/**/*.test.ts'],
          globals: false,
        },
      },
    ],
  },
});
