import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { CREDENCIAIS } from '../../playwright.config';

/**
 * Prepara o banco e as sessões, uma vez, antes de qualquer captura.
 *
 * Duas coisas acontecem aqui, e a ordem importa: semear primeiro, porque o seed
 * trunca as tabelas, e só então entrar — um login feito antes do seed usaria uma
 * conta que o truncate apaga.
 *
 * A sessão é guardada como `storageState` em vez de cada teste passar pela tela
 * de login. Não é só velocidade: faz a captura depender do estado logado, não do
 * caminho até ele, então um ajuste visual na tela de login não derruba as
 * capturas do estoque.
 */

const RAIZ_BACKEND = resolve(import.meta.dirname, '../../../backend');
const PASTA_SESSOES = resolve(import.meta.dirname, '.auth');

const URL_BANCO_DE_TESTE = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:test@localhost:5433/stoqd_test';

const API = `http://localhost:${process.env.PORTA_API ?? 3101}`;

function semear() {
  // Chamado por processo, e não importado: o seed é do backend, com o Prisma
  // Client do backend. Importar daqui atravessaria a fronteira dos dois pacotes
  // para economizar um spawn.
  execFileSync('npx', ['tsx', 'tests/helpers/seedE2e.ts'], {
    cwd: RAIZ_BACKEND,
    env: { ...process.env, DATABASE_URL: URL_BANCO_DE_TESTE },
    stdio: 'pipe',
  });
}

async function entrar(identifier: string, password: string) {
  const resposta = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  if (!resposta.ok) {
    throw new Error(`Login de ${identifier} falhou: ${resposta.status} ${await resposta.text()}`);
  }

  return (await resposta.json() as { token: string }).token;
}

/**
 * O formato que o Playwright restaura no navegador.
 *
 * A aplicação guarda o token em `localStorage` sob a chave `token` — mesma chave
 * de `utils/auth.ts`. Se ela mudar, isto quebra, e o erro aparece como "a tela
 * redirecionou para o login", que é confuso. Daí o nome vir escrito aqui.
 */
function sessaoCom(token: string) {
  return {
    cookies: [],
    origins: [{
      origin: `http://localhost:${process.env.PORTA_WEB ?? 5273}`,
      localStorage: [{ name: 'token', value: token }],
    }],
  };
}

function guardar(nome: string, conteudo: unknown) {
  const caminho = resolve(PASTA_SESSOES, `${nome}.json`);
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, JSON.stringify(conteudo, null, 2));
}

export default async function globalSetup() {
  semear();

  const admin = await entrar(CREDENCIAIS.adminEmail, CREDENCIAIS.adminSenha);
  const cliente = await entrar(CREDENCIAIS.clienteTelefone, CREDENCIAIS.clienteSenha);

  guardar('admin', sessaoCom(admin));
  guardar('cliente', sessaoCom(cliente));
}
