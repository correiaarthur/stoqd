import { defineConfig, devices } from '@playwright/test';

/**
 * Captura de tela como rede para a refatoração de identidade visual.
 *
 * É o único teste do projeto que vê **layout**. Os 324 testes de comportamento
 * não percebem alinhamento quebrado, contraste perdido, componente sumido em
 * tela estreita ou sobreposição — e é exatamente isso que uma troca de identidade
 * arrisca.
 *
 * ## Portas próprias
 *
 * 3101 e 5273, não 3001 e 5173. O e2e sobe os seus próprios servidores e não
 * pode competir com o `npm run dev` que você já tem aberto, nem servir de
 * surpresa quando um dos dois morrer.
 *
 * ## Nunca o banco de produção
 *
 * O backend sobe com `DATABASE_URL` apontando para o Postgres descartável da
 * 5433. O seed trunca tabelas; rodar isso contra o Supabase apagaria a loja.
 *
 * ## O admin é de ambiente
 *
 * `ADMIN_EMAIL`/`ADMIN_PASSWORD` entram aqui como credencial de teste — a
 * autenticação do admin não passa por tabela, então não há o que semear. Elas só
 * existem dentro deste processo.
 */

const PORTA_API = 3101;
const PORTA_WEB = 5273;

const URL_BANCO_DE_TESTE = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:test@localhost:5433/stoqd_test';

export const CREDENCIAIS = {
  adminEmail: 'admin@e2e.test',
  adminSenha: 'senha-de-teste-e2e',
  clienteTelefone: '11988887777',
  clienteSenha: 'senha-de-teste-e2e',
};

const AMBIENTE_DA_API = {
  DATABASE_URL: URL_BANCO_DE_TESTE,
  PORT: String(PORTA_API),
  NODE_ENV: 'development',
  JWT_SECRET: 'segredo-de-teste-e2e-com-mais-de-32-caracteres',
  ADMIN_EMAIL: CREDENCIAIS.adminEmail,
  ADMIN_PASSWORD: CREDENCIAIS.adminSenha,
  CORS_ORIGINS: `http://localhost:${PORTA_WEB}`,
};

export default defineConfig({
  testDir: './tests/e2e',
  // O seed roda uma vez e os testes leem o mesmo estado: em paralelo, um teste
  // que abrisse um modal competiria com a captura de outro.
  workers: 1,
  fullyParallel: false,
  // Em CI, uma referência faltando deve falhar, não ser criada em silêncio.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],

  globalSetup: './tests/e2e/global-setup.ts',

  use: {
    baseURL: `http://localhost:${PORTA_WEB}`,
    // Só na falha: guardar vídeo de tudo enche o disco sem ajudar.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  expect: {
    toHaveScreenshot: {
      /**
       * Uma folga pequena, e deliberada.
       *
       * Renderização de fonte varia alguns pixels entre máquinas e versões do
       * navegador. Zero tolerância transforma a suíte em alarme falso; folga
       * grande deixa passar o deslocamento de meia linha que se quer pegar.
       * 0,15% da área, com diferença de cor por pixel de até 20%.
       */
      maxDiffPixelRatio: 0.0015,
      threshold: 0.2,
      // Desliga animação e caret, que são a causa mais comum de imagem instável.
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      // Uma refatoração visual quebra telas estreitas primeiro, e é onde
      // ninguém olha. 390×844 é a janela de um iPhone comum.
      //
      // Chromium com a viewport do iPhone, e não o WebKit que `devices` traz por
      // padrão: o que se compara aqui é o **nosso** layout em tela estreita, não
      // o motor. Um segundo motor exigiria outro download de 90 MB e renderizaria
      // fontes de outro jeito, tornando as referências dependentes dele sem
      // acrescentar nada sobre o CSS que escrevemos.
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: false,
        hasTouch: true,
      },
    },
  ],

  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: '../backend',
      port: PORTA_API,
      env: AMBIENTE_DA_API,
      reuseExistingServer: !process.env.CI,
      // O backend despeja todo o SQL em `stdout` fora de produção, e isso afoga
      // o resultado dos testes. `stderr` continua passando: erro de verdade
      // precisa aparecer.
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${PORTA_WEB} --strictPort`,
      port: PORTA_WEB,
      env: { VITE_API_URL: `http://localhost:${PORTA_API}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
