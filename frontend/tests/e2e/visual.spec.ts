import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * As imagens de referência de cada tela.
 *
 * Como usar numa refatoração de identidade visual:
 *
 *   1. antes de mexer em CSS:  npm run e2e:update   (gera as referências)
 *   2. durante a refatoração:  npm run e2e          (mostra o que mudou)
 *   3. mudança que você queria: npm run e2e:update   (aceita a nova referência)
 *
 * O passo 2 é o único jeito de descobrir que a tela de Ajustes quebrou enquanto
 * você mexia no Checkout. Ele não decide se a mudança é boa — decide se foi
 * intencional.
 *
 * ## O que é mascarado, e por quê
 *
 * Máscara pinta uma região de rosa antes de comparar. É para o que muda por
 * natureza e não por causa do código:
 *
 *   - eixo de data do gráfico — os rótulos andam todo dia
 *   - fotos de produto — vêm do Supabase Storage, dependem de rede
 *
 * Mascarar é perder cobertura naquele pedaço, então cada máscara aqui tem motivo
 * escrito. A tentação é mascarar até a imagem parar de falhar; o resultado disso
 * é uma suíte verde que não olha nada.
 */

const SESSAO_ADMIN = resolve(import.meta.dirname, '.auth/admin.json');
const SESSAO_CLIENTE = resolve(import.meta.dirname, '.auth/cliente.json');

/**
 * O dia que o navegador acredita que é — o mesmo em que o seed foi ancorado.
 *
 * Sem congelar, o texto das datas anda com o calendário (08/11/2027 vira
 * 09/11/2027) e toda referência quebra sozinha de um dia para o outro, sem
 * ninguém ter tocado no código. Congelado, a imagem só muda quando o código
 * muda — que é a única razão pela qual ela deveria mudar.
 */
const ANCORA = new Date('2026-06-15T12:00:00.000Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(ANCORA);
});

/**
 * Espera a tela parar de se mexer antes de fotografar.
 *
 * Sem isto a captura pega o "Carregando..." em vez do conteúdo, e a imagem fica
 * instável: às vezes o fetch volta antes, às vezes depois.
 */
async function pronta(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/carregando/i)).toHaveCount(0);
  // As fontes decidem a altura de tudo; comparar antes de carregarem produz
  // deslocamento de linha que não é regressão.
  await page.evaluate(() => document.fonts.ready);
}

/** As fotos vêm do Storage: fora do controle do teste e dependentes de rede. */
const mascararFotos = (page: Page) => ({ mask: [page.locator('img')] });

/** Põe o primeiro produto da vitrine na sacola e abre o checkout. */
async function abrirCheckoutComItem(page: Page) {
  await page.goto('/');
  await pronta(page);
  await page.getByRole('button', { name: /reservar|adicionar|comprar/i }).first().click();
  await page.goto('/checkout');
  await pronta(page);
}

test.describe('vitrine — visitante', () => {
  test('home', async ({ page }) => {
    await page.goto('/');
    await pronta(page);
    await expect(page).toHaveScreenshot('home.png', { fullPage: true, ...mascararFotos(page) });
  });

  test('login', async ({ page }) => {
    await page.goto('/login');
    await pronta(page);
    await expect(page).toHaveScreenshot('login.png', { fullPage: true });
  });

  test('cadastro', async ({ page }) => {
    await page.goto('/cadastro');
    await pronta(page);
    await expect(page).toHaveScreenshot('cadastro.png', { fullPage: true });
  });

  test('checkout com o carrinho vazio', async ({ page }) => {
    await page.goto('/checkout');
    await pronta(page);
    await expect(page).toHaveScreenshot('checkout-vazio.png', { fullPage: true });
  });

  test('checkout com itens', async ({ page }) => {
    // O estado que mais importa da vitrine, e o que tem mais a perder numa
    // restilização: linha de item, aviso de estoque, total, forma de pagamento.
    await page.goto('/');
    await pronta(page);
    await page.getByRole('button', { name: /reservar|adicionar|comprar/i }).first().click();
    await page.goto('/checkout');
    await pronta(page);
    await expect(page).toHaveScreenshot('checkout-com-itens.png', {
      fullPage: true,
      // O relógio da reserva muda a cada rodada: a validade vem do servidor, no
      // tempo real, e o navegador está com o relógio congelado.
      mask: [page.locator('img'), page.locator('.reservation-timer')],
    });
  });
});

test.describe('loja — admin', () => {
  test.use({ storageState: SESSAO_ADMIN });

  test('estoque', async ({ page }) => {
    // Seis produtos semeados para cobrir os estados do selo: esgotado, promoção,
    // vencido, vencendo em breve, sem validade.
    await page.goto('/estoque');
    await pronta(page);
    await expect(page).toHaveScreenshot('estoque.png', { fullPage: true, ...mascararFotos(page) });
  });

  test('clientes', async ({ page }) => {
    // Três clientes: em dia, devendo, em atraso.
    await page.goto('/customers');
    await pronta(page);
    await expect(page).toHaveScreenshot('clientes.png', { fullPage: true });
  });

  test('vendas', async ({ page }) => {
    await page.goto('/vendas');
    await pronta(page);
    await expect(page).toHaveScreenshot('vendas.png', { fullPage: true });
  });

  test('dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await pronta(page);
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      mask: [
        // Os gráficos têm o dia no eixo, e o eixo anda com o calendário.
        page.locator('.recharts-wrapper'),
        // "Situação do Estoque" é calculada no **servidor**, cujo relógio o
        // `page.clock` não congela: o navegador acredita que é junho de 2026, o
        // backend sabe que não é. Vencidos e vencendo mudariam de valor com o
        // tempo real passando. Os cartões de receita acima seguem comparados.
        page.locator('.inventory-panel'),
      ],
    });
  });

  test('ajustes', async ({ page }) => {
    await page.goto('/ajustes');
    await pronta(page);
    await expect(page).toHaveScreenshot('ajustes.png', { fullPage: true });
  });

  test('ajustes com um cupom em edição', async ({ page }) => {
    // O formulário de cupom no modo de edição e a linha selecionada na lista.
    await page.goto('/ajustes');
    await pronta(page);
    await page.locator('.cp-row').first().click();
    await expect(page.getByRole('heading', { name: /editar cupom/i })).toBeVisible();
    await expect(page).toHaveScreenshot('ajustes-editando-cupom.png', { fullPage: true });
  });

  test('checkout do balcão com itens', async ({ page }) => {
    // Cliente, desconto, forma de pagamento e resumo: o painel do admin inteiro.
    await abrirCheckoutComItem(page);
    await expect(page).toHaveScreenshot('checkout-balcao.png', { fullPage: true, ...mascararFotos(page) });
  });

  test('checkout do balcão com a lista de clientes aberta', async ({ page }) => {
    await abrirCheckoutComItem(page);
    await page.getByPlaceholder('Consumidor final').click();
    await expect(page.locator('.customer-dropdown-menu')).toBeVisible();
    await expect(page).toHaveScreenshot('checkout-balcao-clientes.png', { fullPage: true, ...mascararFotos(page) });
  });

  test('cadastro de produto', async ({ page }) => {
    // Modal é onde sobreposição e empilhamento quebram primeiro, e nenhum teste
    // de comportamento percebe.
    await page.goto('/estoque');
    await pronta(page);
    await page.getByRole('button', { name: /novo produto|adicionar/i }).first().click();
    await expect(page.getByText(/novo produto/i).first()).toBeVisible();
    await expect(page).toHaveScreenshot('modal-produto.png');
  });
});

test.describe('conta — cliente', () => {
  test.use({ storageState: SESSAO_CLIENTE });

  test('minha conta', async ({ page }) => {
    await page.goto('/minha-conta');
    await pronta(page);
    await expect(page).toHaveScreenshot('minha-conta.png', { fullPage: true });
  });

  test('checkout do cliente logado com itens', async ({ page }) => {
    // Cupom, forma de pagamento, observação e o botão de enviar o pedido.
    await abrirCheckoutComItem(page);
    await expect(page).toHaveScreenshot('checkout-cliente.png', {
      fullPage: true,
      // O relógio da reserva: a validade vem do servidor, no tempo real, e o
      // navegador está com o relógio congelado — o contador muda a cada rodada.
      // O componente é coberto por teste unitário.
      mask: [page.locator('img'), page.locator('.reservation-timer')],
    });
  });
});
