import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Só as funções puras por enquanto: formatação, validade e leitura de erro
    // da API. Testar componente pede jsdom e testing-library, que é uma decisão
    // à parte — e as três telas maiores ainda vão ser quebradas em pedaços.
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
