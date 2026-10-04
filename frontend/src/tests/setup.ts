import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

/**
 * Preparo de cada teste de componente.
 *
 * `localStorage` é limpo entre testes porque metade da aplicação depende dele —
 * token, carrinho, cartToken. Sem isso um teste herda o estado do anterior e a
 * ordem de execução passa a importar, que é o jeito mais rápido de ter uma
 * suíte que falha só na máquina de outra pessoa.
 */
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});
