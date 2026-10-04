import { defineConfig } from 'vitest/config';

/**
 * Um ambiente só: jsdom.
 *
 * Tentei separar "lógica pura em node" de "componente em jsdom", por simetria
 * com o backend, e estava errado — a divisão era por extensão de arquivo, mas o
 * que decide é o que o módulo precisa. `utils/auth.ts` não importa React e
 * mesmo assim depende de `localStorage` e `atob`: é código de navegador. Separar
 * por extensão fazia o teste cair no projeto errado por um detalhe invisível.
 *
 * Isto é frontend; o navegador é o ambiente. O custo é alguns milissegundos.
 *
 * O que NENHUM teste daqui pega: layout. Classe trocada, espaçamento, cor,
 * sobreposição — nada disso aparece. Para refatoração de identidade visual o
 * guarda é captura de tela (Playwright), que é uma decisão à parte.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/tests/setup.ts'],
    globals: false,
  },
});
