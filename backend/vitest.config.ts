import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes ficam ao lado do código que exercitam: achar o teste de
    // `pricingRules.ts` não deveria exigir navegar numa árvore paralela.
    include: ['src/**/*.test.ts'],
    // Sem `globals`: cada arquivo importa `describe`/`it`/`expect` do vitest,
    // que é o que `verbatimModuleSyntax` e o tsconfig estrito já esperam.
    globals: false,
  },
});
