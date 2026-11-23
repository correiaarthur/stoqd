# Mapa do código

O que cada arquivo do stoqd faz, por que ele existe e o que muda se ele mudar.
O `README.md` conta o que o sistema é e como rodar; este documento é o mapa de
quem vai mexer nele.

---

## Sumário

1. [Estrutura em uma tela](#1-estrutura-em-uma-tela)
2. [As decisões que explicam o código](#2-as-decisões-que-explicam-o-código)
3. [Backend](#3-backend)
4. [Mapa das rotas da API](#4-mapa-das-rotas-da-api)
5. [Frontend](#5-frontend)
6. [Fluxos ponta a ponta](#6-fluxos-ponta-a-ponta)
7. [Variáveis de ambiente](#7-variáveis-de-ambiente)
8. [Pontos de atenção](#8-pontos-de-atenção)

---

## 1. Estrutura em uma tela

```
stoqd/
├── backend/                  API REST (Node + Express 5 + Prisma + Postgres)
│   ├── prisma/
│   │   ├── schema.prisma     O modelo de dados inteiro
│   │   └── migrations/       Histórico versionado do banco
│   ├── src/
│   │   ├── server.ts         Sobe o Express, monta middlewares e routers
│   │   ├── routes/           Um arquivo por recurso: caminho + quem pode
│   │   ├── controllers/      Um arquivo por recurso: HTTP in, HTTP out
│   │   ├── services/         Casos de uso que orquestram transações (pedidos e conta)
│   │   ├── lib/              Regra de negócio, sem Express
│   │   ├── middlewares/      Autenticação/autorização, limites por rota e rede de segurança de erros
│   │   └── scripts/          Tarefas manuais (hash de senha)
│   └── tests/                Integração (Postgres descartável) e helpers; os unitários ficam em `src/**/tests/`
│
├── docs/                     Este mapa
├── .github/workflows/ci.yml  Typecheck + testes do backend; lint, build e testes do frontend; audit
│
└── frontend/                 SPA (React 19 + Vite + React Router 7)
    ├── src/
    │   ├── App.tsx           Rotas, guardas por papel e o `Shell` (loja × barra lateral do admin)
    │   ├── api.ts            Axios com interceptors de token e 401
    │   ├── pages/            Uma tela por arquivo (+ o CSS ao lado)
    │   ├── components/       Pedaços reutilizados; `checkout/` e `settings/` guardam os pedaços das duas telas maiores
    │   ├── contexts/         Carrinho, avisos (toast) e confirmação — estado que atravessa telas
    │   ├── hooks/            Busca de dados, formulários e relógios
    │   ├── services/         Uma função por chamada à API (as telas não escrevem URL)
    │   ├── utils/            Token, formatação, erros, validade, simulação de parcelas
    │   └── lib/supabase.ts   Cliente do Storage, só para enviar a imagem de produto
    └── tests/e2e/            Capturas de tela do Playwright (ver o README da pasta)
```

**Camadas do backend, em uma frase:** `routes` decide *quem pode chamar*,
`controllers` traduz HTTP em chamada de regra, `services` executa um caso de uso
inteiro (o ciclo de vida do pedido e a conta do cliente) e `lib` contém as regras
puras que eles usam. O `errorHandler` fica por último e pega o que escapar.

---

## 2. As decisões que explicam o código

Seis decisões respondem pela maior parte do que parece estranho à primeira
leitura. Elas aparecem citadas nos comentários do código.

| # | Decisão | Onde vive |
|---|---|---|
| **D1** | **Disponível nunca é armazenado, sempre derivado.** Disponível = `Product.quantity` − reservas ativas, calculado na leitura. Não existe job liberando reserva vencida: ela deixa de contar no instante em que vence. | `lib/availability.ts` |
| **D2** | **O balcão ganha da reserva.** Quem está com o produto na mão vende. A venda confere o estoque **físico**; um pedido online pode ser recusado na confirmação porque o item saiu na loja. | `lib/sales.ts`, `services/orders.service.ts` |
| **D3** | **Pedido não é venda.** O pedido nasce `PENDING`, não baixa estoque e não gasta cupom. Só a confirmação cria a `Sale` — pelo mesmo caminho da venda de balcão. | `services/orders.service.ts` |
| **D4** | **Conta de acesso ≠ cliente.** `User` guarda login; `Customer` guarda histórico. Apagar a conta não apaga as vendas. O vínculo nasce na confirmação de um pedido, quando uma pessoa reconhece a outra. | `schema.prisma`, `services/account.service.ts` |
| **D5** | **Autenticar não é autorizar.** Cliente e admin recebem token assinado pelo mesmo segredo, então toda rota protegida precisa de `requireAdmin` ou `requireCustomer` depois do `authMiddleware`. | `middlewares/auth.ts` |
| **D6** | **Preço, taxa e desconto vêm do banco, nunca do corpo da requisição.** Senão o comprador escolhe o próprio preço e os próprios juros. | `lib/sales.ts`, `lib/pricingRules.ts` |
| **D7** | **Dinheiro é centavo inteiro no banco, reais no código.** Colunas `Float` somavam com erro (0,1 + 0,2 = 0,30000000000000004) e o `SUM` do banco o acumulava. As colunas de dinheiro são `Int`, e uma extensão do Prisma converte na fronteira: o código e o frontend continuam em reais. | `lib/moneyColumns.ts`, `lib/prisma.ts` |

**A ordem das contas** (`lib/pricingRules.ts`), que todo total do sistema segue:

```
bruto    = soma dos itens
desconto = cupom + desconto manual        (nunca maior que o bruto)
líquido  = bruto − desconto
juros    = líquido × taxa do parcelamento (juros sobre o líquido, não sobre o bruto)
total    = líquido + juros
```

---

## 3. Backend

### 3.1 Entrada e configuração

| Arquivo | O que faz |
|---|---|
| `src/server.ts` | Chama `assertEnv()` antes de tudo e monta o Express na ordem `helmet` → `cors` → `limiter` → `express.json()` (teto de 100 kb) → routers → `notFound` → `errorHandler`. Atrás de proxy, `trust proxy` vale `TRUST_PROXY` saltos (padrão 1 em produção, 0 fora). Sem `CORS_ORIGINS` a API reflete qualquer origem — cômodo no desenvolvimento, avisado no log em produção. `GET /health` é a sonda do orquestrador (não toca o banco). Exporta o `app` e só chama `listen` quando `NODE_ENV` não é `test`, para os testes de integração subirem-no numa porta efêmera. |
| `src/lib/env.ts` | Confere o ambiente na subida: faltando `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` ou a senha do admin, o processo morre listando o que falta. Em produção exige `JWT_SECRET` de 32+ caracteres e avisa de `CORS_ORIGINS`/`ADMIN_PASSWORD_HASH` ausentes. Exporta `isProduction`. |
| `prisma.config.ts` | Aponta o Prisma CLI para o schema e para as migrations. |
| `package.json` | `dev` (tsx watch), `build` (`prisma generate` + `tsc`), `start`, `typecheck` (código e testes), `migrate:deploy`, `hash-password`, `test` (unitários), `test:integration` (sobe o Postgres descartável e roda), `test:all`, `test:db:up`/`test:db:down` e `seed:e2e` (semeia o banco das capturas de tela). |
| `vitest.config.ts` | Dois projetos: `unit` (`src/**/tests/`, junto do módulo, sem nada fora do processo) e `integration` (`tests/integration/`, um arquivo por vez contra o Postgres do `tests/docker-compose.yml`). O critério é *precisa de algo fora do processo?*. |
| `.env.example` | Documenta cada variável, inclusive as opcionais do aviso de pedido e do Storage. É a referência da seção 7. |
| `tsconfig.json` | ESM (`"type": "module"`), por isso todo import interno termina em `.js`. `tsconfig.test.json` cobre os testes no `typecheck`. |

### 3.2 Modelo de dados — `prisma/schema.prisma`

| Model | Papel | Detalhe que importa |
|---|---|---|
| `Brand` / `Category` | Taxonomia do catálogo. | Apagar marca **cascateia** nos produtos; categoria só desvincula (`categoryId` é opcional). |
| `Product` | Item do catálogo. `name` é `@unique`. | Guarda uma única `expiryDate` — sem controle por lote. `quantity` é o físico; o disponível é derivado (D1). Preços em centavos (`Int`, D7); `averageCost` é `Float` de propósito. |
| `Customer` | Quem aparece nas vendas. | Existe sem conta; `user` é o lado inverso do vínculo opcional. |
| `Sale` | Venda registrada. | `discount` e `interest` ficam separados do `total` para o faturamento não confundir juros com venda de produto. `couponId` fica guardado para auditoria. |
| `SaleItem` | Linha da venda com `unitPrice` congelado. | O preço fica na venda, não no produto: mudar o preço não reescreve o passado. |
| `Installment` | Parcela com `dueDate` e `paidAt`. | `paidAt = null` é o que define pendência e atraso em toda a UI. |
| `User` | Conta de acesso (D4). | Login pelo `phone` (só dígitos, `@unique`); `email` opcional e único quando presente. `role` default `customer`. `tokenVersion` sobe ao trocar a senha e invalida os tokens antigos. |
| `Reservation` | Reserva de estoque com prazo. | Ativa = `expiresAt > now()` **e** `orderId IS NULL`. Presa a um pedido, sai da conta de disponível — é a D2 no schema. |
| `Order` | Pedido da vitrine. | `saleId` null = nenhum estoque baixado. `paymentType`/`installmentsCount` são **preferência do cliente**, não decisão. |
| `OrderItem` | Linha do pedido com o preço do momento. | É o que permite cobrar o valor que a pessoa viu. |
| `Coupon` | Cupom de desconto. | `usedCount` só sobe quando a venda é registrada. `code` sempre em maiúsculas. |
| `InstallmentPlan` | Taxa de juros por parcelamento (2x–12x). | `installments` é a chave primária. Não existe linha para 1x: à vista é sempre 0%. |

### 3.3 `src/lib/` — a regra de negócio

Nenhum arquivo aqui conhece `Request`/`Response`. É o que permite que a venda de
balcão e a confirmação de pedido cheguem ao mesmo lugar.

| Arquivo | Responsabilidade | Notas |
|---|---|---|
| `prisma.ts` | Cliente Prisma único, via adapter `pg`, **com a extensão de dinheiro**. | Em produção o log de query é desligado — ele despejaria dados de clientes no stdout. |
| `moneyColumns.ts` | **A fronteira reais ⇄ centavos.** Uma extensão do Prisma converte na escrita (`data`, inclusive aninhada em `create`/`update`/`upsert`/`createMany`, e `where`) e na leitura (inclusive `include`, `_sum`/`_avg`/`_min`/`_max`). As relações vêm do `Prisma.dmmf`; só a lista das colunas monetárias (`MONEY_COLUMNS`) é escrita à mão. | Os tipos do TypeScript não mudam (`Int` e `Float` são `number`). **Não cobre SQL cru** (`$queryRaw`): quem o escreve converte por conta própria — hoje só a dívida em `customers.controller`. `multiply`/`divide` em campo monetário são recusados. Ficam de fora, de propósito, `Product.averageCost` (média ponderada, pode ter fração de centavo) e `InstallmentPlan.interestPercent` (uma taxa). `Coupon.value` é percentual *ou* valor fixo, ambos em centésimos. Um teste impede um `Float` novo no schema sem decisão. |
| `availability.ts` | **Coração da D1.** `getReservedByProduct`, `getStockView`, `withAvailability`. Define os prazos (5 min anônimo / 30 min identificado) e os tetos do carrinho (50 unidades, 30 linhas). | `excludeCartToken` existe para o carrinho de alguém não bloquear essa mesma pessoa. `available` nunca é negativo. |
| `sales.ts` | **`registerSale`: o único lugar que cria venda, baixa estoque e gera parcelas.** Também `buildInstallments` e a classe `SaleError`. | Confere o estoque **físico** (D2). Divide as parcelas em centavos e joga o resto nas primeiras. |
| `pricingRules.ts` | A ordem desconto → juros (`computeTotals`), a faixa 2x–12x, `getInterestPercent` e `toCents`. | Parcelamento desligado devolve `null` e a venda **recusa** — desligar uma opção não pode virar desconto silencioso. |
| `pricing.ts` | `getActivePrice`: promocional quando existe, senão o de venda. | Uma linha, importada por todo lado de propósito: se cada tela calculasse, o caixa cobraria um valor e a vitrine mostraria outro. |
| `coupons.ts` | Normaliza o código, valida (`checkCoupon`) e consome (`consumeCoupon`). | Valida duas vezes: na tela, para informar; na transação, para decidir. O `updateMany` condicional impede dois pedidos simultâneos de passar do `maxUses`. |
| `validate.ts` | **A base da validação de entrada**, em Zod: `parseWith` (devolve o dado convertido ou a primeira mensagem), `bodyOf` (corpo que não é objeto vale como vazio, e chave de fora é descartada) e as primitivas `positiveInt`, `money`, `optional`, `trimmed`. | Todo schema define a mensagem de cada regra, em português; o Zod está configurado em `ptBR` para que uma mensagem esquecida nunca saia em inglês. A ordem das chaves do schema é a ordem em que o erro é reportado. |
| `cartItems.ts` | `cartItemsSchema` (e `parseCartItems`, que o envolve) e `parseCartToken`. | Rejeita quantidade não-inteira, negativa e produto repetido — negativo passaria na checagem de estoque e *aumentaria* o estoque no decremento. |
| `validation.ts` | Os schemas de conta: `registerSchema`, `accountSchema`, `changePasswordSchema`, `customerSchema`, `labelBody`; mais `parseId` e os normalizadores (nome, telefone só com dígitos, e-mail). | Compartilhado por cadastro, perfil e cliente de balcão, para as telas recusarem as mesmas coisas. A senha tem teto de 72 bytes: o bcrypt só lê esses, e truncaria o resto em silêncio. |
| `productInput.ts` | `productSchema` e as regras de reabastecimento (`mergeAverageCost`, `mergeExpiryDates`). | Recusa dia de validade que não existe (30 de fevereiro) em vez de empurrá-lo para o mês seguinte. |
| `orderInput.ts` | Os corpos de criar, confirmar e recusar pedido, e a lista de pedidos por situação. | Forma de pagamento desconhecida é recusada: um "PRZO" digitado errado, lido como à vista, registraria como paga uma venda que ia ser fiada. |
| `orderView.ts` | A resposta da lista de pedidos para a loja: `buildAdminOrderView` e suas peças (`buildItemView`, `buildRequestedView`, `suggestedCustomersFor`). | Puro: recebe o que o service leu e devolve o que a tela mostra. O desligamento de um parcelamento depois do pedido aparece como taxa `null`, nunca como juro inventado. |
| `orderHistory.ts` | O histórico de compras da conta: `buildPurchaseHistory` e suas peças (`buildOrderEntry`, `buildSaleEntry`, `serializeInstallments`). | Pura. Pedido confirmado mostra o que a **venda** cobrou (desconto, juros, cupom), não o que o pedido dizia. |
| `saleInput.ts` | O corpo da venda de balcão e as consultas (lista de vendas, relatório, subtotal). | O relatório exige `from`: sem período puxaria o histórico inteiro. |
| `adminCredentials.ts` | Compara a senha do admin por bcrypt, com cache do hash. | Sem `ADMIN_PASSWORD_HASH`, gera o hash de `ADMIN_PASSWORD` na subida e avisa. |
| `tokens.ts` | **Emitir e verificar o token — e poder revogá-lo.** `signCustomerToken` (leva `tv`, a versão da sessão), `signAdminToken` (leva `cf`, a impressão digital das credenciais do `.env`) e `verifyAuthToken`. | Cliente: o token só vale se `tv` for igual a `User.tokenVersion`; trocar a senha incrementa, e apagar a conta apaga a linha — uma leitura por chave primária a cada requisição. Admin: sem linha no banco, a revogação vem de a credencial mudar (HMAC de e-mail + hash, ou a senha em texto, que não leva sal novo a cada reinício). Token de cliente sem `tv` vale como 0, para ninguém cair no deploy; token de admin sem `cf` é recusado. |
| `notifications.ts` | Avisa **a loja** de pedido novo, por Telegram e Resend. | Cada canal no seu try/catch; nunca lança. Falha de aviso não derruba pedido. Loga só o status HTTP, para não vazar token. |
| `errors.ts` | `DomainError` (mensagem de regra **com o status HTTP junto**) e `respondWithError`, o `catch` padrão do controller: erro de domínio vira a própria mensagem; qualquer outra coisa é logada e vira 500 genérico, sem vazar detalhe. | O controller não precisa de um `if` por tipo de erro: quem lança decide se é 400, 404, 409 ou 429. |
| `env.ts` | Confere o ambiente na subida (ver 3.1). | Roda antes do `listen`; um servidor que não sobe é um problema óbvio, um que sobe quebrado não. |
| `expiryWindow.ts` | Validade por **dia de calendário**: `startOfTodayUTC`, `expiryWarningLimitUTC`, `expiryStatusOf` (`none`/`expired`/`soon`/`ok`) e `EXPIRY_WARNING_DAYS` (90). | `expiryDate` é a meia-noite UTC do dia impresso na embalagem; comparar com a meia-noite *local* marcava como vencido o que vence hoje. Quem vence hoje é `soon`. O frontend repete a regra em `utils/expiry.ts`. |
| `format.ts` | `formatBRL`: reais como o Brasil escreve. | Uma só cópia para o aviso de pedido e a mensagem do cupom. |
| `showcaseQuery.ts` | Lê a query da vitrine sem confiar nela (`parseShowcaseQuery`), monta o `where` (`buildShowcaseWhere`, `PROMO_WHERE`) e codifica o cursor de paginação. | 24 por página (teto 60). A vitrine anda em duas fases — primeiro o que tem estoque (`i:<id>`), depois o esgotado (`o:<id>`); cursor numérico antigo vale como "com estoque". Valor estranho vira o padrão, nunca 500. |
| `storage.ts` | Upload de foto de produto **assinado pelo servidor**: `createProductImageUpload` (URL de envio de uso único, caminho `fotos/<uuid>.<ext>` escolhido aqui), `productImageUploadSchema` (JPG/PNG/WebP, até 5 MB) e `isAllowedImageUrl`. | O navegador não escreve mais no bucket com a chave anon. `imageUrl` só vale se apontar para o nosso bucket. Sem `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, o envio responde 503. |
| `prismaErrors.ts` | Traduz P2002/P2003/P2025 em 409/409/404 com texto que o operador entende (`translatePrismaError`, ou `rethrowTranslated`, que já lança `DomainError`). `duplicatedFieldsOf` diz qual campo duplicou. | Lê `error.code` como string em vez de importar a classe do Prisma, que muda de lugar entre versões. Com o adapter `pg` o campo duplicado vem em `meta.driverAdapterError.cause.constraint.fields`, **não** em `meta.target`: ler só o segundo reportava e-mail duplicado como telefone. |

### 3.4 `src/middlewares/`

| Arquivo | Conteúdo |
|---|---|
| `auth.ts` | `authMiddleware` (exige token válido **e não revogado**, com papel), `optionalAuth` (token ruim ou revogado = visitante), `requireAdmin`, `requireCustomer` e `adminOnly` (os dois primeiros juntos). Token sem papel é recusado — um token antigo não vira admin por omissão. A verificação mora em `lib/tokens.ts`. |
| `rateLimiter.ts` | Seis limitadores, cada um dimensionado pelo que a rota faz: geral 600/15min · login 10/15min (sucesso não conta) · cadastro 5/h · carrinho 120/15min · pedido 10/15min · cupom 20/15min. |
| `errorHandler.ts` | `notFound` (404 em JSON) e `errorHandler`, a rede de segurança do que escapa dos `try/catch`: corpo JSON malformado vira 400 e corpo grande demais, 413 — em vez de uma página HTML com stack trace. Erro 5xx devolve texto genérico e, em produção, loga só a mensagem. |

### 3.4a `src/services/` — os casos de uso

**`orders.service.ts`** tem os quatro casos de uso do pedido, cada um numa transação.
Os erros de regra saem como `DomainError`, com o status HTTP junto, e o controller
só os traduz.

| Função | O que faz |
|---|---|
| `createOrder` | Confere o limite de 3 pedidos pendentes por conta, o estoque de cada item (a reserva do próprio carrinho não conta contra ele) e o parcelamento e o cupom pedidos; congela o preço que a pessoa viu, grava o pedido `PENDING`, prende as reservas do carrinho a ele por 30 minutos e, **depois do commit e sem `await`**, avisa a loja. |
| `listOrders` | Lê os pedidos e três coisas independentes em paralelo (estoque, planos de parcelamento, candidatos a cliente) e entrega tudo a `lib/orderView.ts`, que monta a resposta. |
| `confirmOrder` | Em passos nomeados: `claimPendingOrder` (reivindica o pedido **no próprio UPDATE**, para dois cliques simultâneos não gerarem duas vendas), `linkCustomer`, `couponForSale` e `registerSale`. Se qualquer passo falha, a transação inteira reverte e o pedido continua pendente. |
| `cancelOrder` | Só recusa pedido pendente, guarda o motivo e solta as reservas dele. |

**`account.service.ts`** é a conta do cliente: `getAccount`, `updateAccount` (recusa o
e-mail do admin; e-mail e telefone duplicados dizem qual dos dois), `changeAccountPassword`
(exige a atual; sobe a versão da sessão e devolve um token novo), `deleteAccount` (só a
conta — as vendas e o cliente de balcão ficam) e `getPurchaseHistory`. Quem monta o
histórico é `lib/orderHistory.ts`, pura: junta os pedidos da vitrine e, só quando a loja
ligou a conta a um cliente, as vendas de balcão dele, sem repetir a venda que nasceu de um
pedido.

`lib/orderView.ts` é a parte pura da listagem — sem banco, sem relógio: o preço do
pedido ao lado do de hoje (diferença menor que meio centavo não conta como
mudança), o que o cliente pediu com as contas prontas, e os clientes de balcão
sugeridos pelo telefone ou e-mail.

### 3.5 `src/controllers/` e `src/routes/`

Cada recurso tem um par. O arquivo de rota é curto de propósito: ele é onde se lê
**quem pode chamar o quê**.

| Controller | O que resolve |
|---|---|
| `auth.controller.ts` | Cadastro e login. Um campo de identificação, dois tipos de conta: o admin é testado primeiro (e-mail do `.env`), o cliente entra pelo telefone. Token de 1 dia. |
| `me.controller.ts` | Só o HTTP da área do cliente: ver/editar a conta, trocar a senha (exige a atual; **encerra as outras sessões** e devolve um token novo para esta; senha atual errada é 400, não 401, para o cliente web não tratar como sessão expirada), excluir o perfil e o histórico de compras. A regra está em `services/account.service.ts`; os campos públicos garantem que o hash nunca sai numa resposta. |
| `cart.controller.ts` | `reserve` (substitui as reservas do carrinho — repetir a chamada não deixa órfã), `availability` (consulta sem reservar) e `release`. |
| `orders.controller.ts` | Só o HTTP do pedido: lê a requisição (`orderInput.ts`), chama `services/orders.service.ts` e responde. `create` (pedido `PENDING`), `list` (tela de Vendas), `confirm` e `cancel`. A regra mora no service; o controller tem cerca de 70 linhas. |
| `sales.controller.ts` | `create` (venda de balcão — ignora de propósito o `unitPrice` que vier no corpo) e `list` com filtro de período/cliente e teto de 200. |
| `products.controller.ts` | `upsert` com custo médio ponderado e validade mais conservadora; `update`; `remove` (recusa produto já vendido); `getAll` (admin vê físico **e** disponível); `getShowcase` (público, só o disponível, **paginado por cursor** — `{ items, total, nextCursor }`, com filtro por busca, marca, categoria e promoção feito no servidor); `getShowcaseFacets` (o que a vitrine precisa do catálogo **inteiro**: contagem por marca e categoria, total, promoções e até três destaques). |
| `uploads.controller.ts` | `productImage` (admin): valida tipo e tamanho e devolve a URL de envio assinada (`lib/storage.ts`). 503 se o storage não estiver configurado. |
| `customers.controller.ts` | Lista com dívida/atraso já calculados e o extrato completo por cliente, separado de propósito: carregar todo o histórico de todo mundo fazia a resposta crescer sem limite. |
| `analytics.controller.ts` | `getSalesReport` (uma linha por item vendido, com o desconto da venda rateado proporcionalmente) e `getDashboardSummary` (valor de estoque, lucro previsto, ruptura, validade em 90 dias, faturamento do mês). |
| `coupons.controller.ts` | CRUD com um detalhe de fuso: `"2026-09-30"` é montado campo a campo para o cupom não morrer em 29/09 em UTC-3. Cupom já usado é **desativado**, não apagado. |
| `settings.controller.ts` | Tabela de juros: devolve a faixa 2x–12x completa (mesmo o que não existe no banco) e salva tudo numa transação, para não haver estado meio-salvo. |
| `payment.controller.ts` | Público: opções de pagamento com o valor da parcela já calculado, e validação informativa de cupom. |
| `installments.controller.ts` | `PATCH /installments/:id/pay`. Recusa parcela já paga. |
| `brands.controller.ts` / `categories.controller.ts` | CRUD da taxonomia. A mensagem de exclusão de marca avisa que os produtos vão junto. |

### 3.6 `src/scripts/`

| Arquivo | Uso |
|---|---|
| `hash-password.ts` | `npm run hash-password -- "senha"` → imprime a linha pronta do `.env`. |

### 3.6a `tests/` — a rede do backend

| Pasta | Conteúdo |
|---|---|
| `src/**/tests/` | **Unitários**, junto do módulo: regras puras, schemas e a tradução de erros. Rodam em menos de um segundo (`npm test`). |
| `tests/integration/` | **Integração** contra um Postgres descartável (porta 5433): concorrência de venda, confirmação e ciclo do pedido, parcelas, autorização por rota, revogação de token, dinheiro em centavos, purga de reservas, listagens. Um arquivo por vez — em paralelo dariam deadlock no `TRUNCATE`. |
| `tests/helpers/` | `setupIntegration.ts` aponta o client para o banco descartável e **recusa** banco que não seja local; `testDb.ts`, `factories.ts` e `tokens.ts` montam o cenário; `seedE2e.ts` semeia as capturas de tela do frontend. |

### 3.7 `prisma/migrations/`

A linha do tempo do banco, e a leitura mais rápida da evolução do produto:

`init_inventory` → `ajuste_float` → `cria_tabela_vendas` → `adiciona_clientes_e_parcelas`
→ `add_image_url` → `add_categories_promotions_cascade` → `add_discount_to_sale`
→ `reconcile_schema_drift` → `add_product_name_unique` → **`add_users_reservations_orders`**
(a vitrine com carrinho) → `phone_as_login_email_optional` → `coupons_and_installment_interest`
→ `installment_plans_up_to_12` → `interest_free_up_to_3x` → `gradual_interest_ladder`
→ `sale_customer_on_delete_set_null` → `index_foreign_keys` → `index_reservation_expiry`
→ **`user_token_version`** (sessão revogável) → **`money_in_cents`** (D7: as colunas de dinheiro
passam de `Float` a `Int`).

---

## 4. Mapa das rotas da API

**Público** — sem token:

| Método | Rota | Limite | Nota |
|---|---|---|---|
| GET | `/`, `/health` | geral | Verificação de saúde; `/health` devolve `{ status: "ok" }` e não toca o banco. |
| POST | `/auth/login` | 10/15min | Sucesso não conta no limite. |
| POST | `/auth/register` | 5/hora | Devolve token de cliente já pronto. |
| GET | `/products/showcase` | geral | Paginado por cursor. Aceita `?q=`, `?brand=`, `?category=`, `?promo=1`, `?limit=`, `?cursor=` e `?cartToken=` (para não descontar a própria reserva). |
| GET | `/products/showcase/facets` | geral | Contagens por marca e categoria, total, promoções e destaques. |
| GET | `/brands`, `/categories` | geral | Só leitura; escrita é de admin. |
| POST | `/cart/reserve`, `/cart/availability`, `/cart/release` | 120/15min | `optionalAuth`: com token, a reserva vale 30 min em vez de 5. |
| GET | `/payment/options` | geral | `?subtotal=` devolve o valor de cada parcela pronto. |
| POST | `/payment/coupons/validate` | 20/15min | Informativo; quem decide é a venda. |

**Cliente** — `authMiddleware` + `requireCustomer`:

| Método | Rota | Nota |
|---|---|---|
| GET / PUT / DELETE | `/me` | `DELETE` apaga a conta e preserva `Customer` e vendas (D4). |
| PUT | `/me/password` | Exige a atual; encerra as outras sessões e devolve um token novo. |
| GET | `/me/orders` | Histórico de compras: pedidos da vitrine e, se a loja ligou a conta a um cliente, as vendas de balcão dele, com parcelas pagas/pendentes. |
| POST | `/orders` | 10/15min. Máximo de 3 pedidos pendentes por conta. |

**Administração** — `authMiddleware` + `requireAdmin`:

| Método | Rota | Nota |
|---|---|---|
| GET | `/analytics/summary`, `/analytics/sales-report` | Indicadores do dashboard. |
| GET / POST | `/sales` | `POST` é a venda de balcão. |
| GET | `/orders?status=` | `PENDING` (padrão), `CONFIRMED`, `CANCELLED`, `ALL`. |
| POST | `/orders/:id/confirm`, `/orders/:id/cancel` | Confirmar cria a venda; recusar exige motivo. |
| GET / POST / PUT / DELETE | `/products` | `POST` é upsert por nome. |
| POST | `/uploads/product-image` | Devolve a URL de envio assinada da foto (JPG/PNG/WebP, até 5 MB). |
| GET / POST / PUT / DELETE | `/customers` | Mais `GET /customers/:id/statement`. |
| PATCH | `/installments/:id/pay` | Baixa de parcela. |
| GET / POST / PUT / DELETE | `/coupons` | Cupom usado é desativado, não apagado. |
| GET / PUT | `/settings/installments` | Tabela de juros salva inteira. |
| POST / PUT / DELETE | `/brands`, `/categories` | Escrita na taxonomia. |

---

## 5. Frontend

### 5.1 Entrada e configuração

| Arquivo | O que faz |
|---|---|
| `main.tsx` | Monta o React em `#root`, dentro de `StrictMode`. |
| `App.tsx` | `BrowserRouter` → `ToastProvider` → `ConfirmProvider` → `CartProvider` → `Shell` → rotas. O `Shell` dá duas moradas ao app: o **admin** trabalha dentro da `AdminSidebar` (inclusive na vitrine, que para o balcão é a tela de vender); quem compra vê `Header` + conteúdo + `Footer`; `/login` e `/cadastro` não têm moldura. Define `AdminRoute` e `CustomerRoute` — que existem para a pessoa não cair numa tela que não é dela; **quem decide o que pode é o servidor**. `/pdv` redireciona para `/checkout`. |
| `api.ts` | Axios com `VITE_API_URL`. Interceptor de request injeta o token; o de response trata 401 limpando o token e mandando ao login — menos no próprio login, onde a mensagem já aparece na tela. |
| `vite.config.ts` / `vercel.json` | Build com plugin React; o rewrite manda tudo para `index.html` (SPA com rotas do lado do cliente). |
| `vitest.config.ts` / `src/tests/setup.ts` | Testes de comportamento em jsdom (Testing Library). |
| `playwright.config.ts` / `tests/e2e/` | Capturas de tela, a única rede que enxerga **layout**. Banco semeado, relógio congelado e portas próprias; as referências são `-darwin.png`, por isso ficam fora do CI. Detalhes em `tests/e2e/README.md`. |
| `index.css` | Design system "Caatinga II": paleta em variáveis (`--areia`/`--papel` de fundo, `--tinta` de texto, `--mandacaru` verde, `--coroa` rosa, estados `--estado-*`) e tokens semânticos (`--bg-color`, `--card-color`, `--text-main`…); tipografia Fraunces (títulos), Schibsted Grotesk (texto) e Bricolage Grotesque (números); reset e classes base. Tema **claro**. |
| `lib/supabase.ts` | Cliente do Supabase Storage com a chave anon — usado **só** para `uploadToSignedUrl` no envio da imagem de produto (bucket `produtos`). Quem autoriza o envio é o backend (`POST /uploads/product-image`). |

**Rotas da SPA:** `/` vitrine · `/login` · `/cadastro` · `/checkout` (público) ·
`/minha-conta` (cliente) · `/dashboard`, `/estoque`, `/vendas`, `/customers`,
`/ajustes` (admin).

### 5.2 `contexts/` — estado que atravessa telas

| Arquivo | Conteúdo |
|---|---|
| `cart.ts` | Tipos e `useCart()`. Documenta a diferença entre `available` (o que o visitante pode levar) e `quantity` (o que o balcão respeita, D2). |
| `CartProvider.tsx` | O carrinho vive no `localStorage` e **não depende da reserva** — por isso o checkout pergunta a disponibilidade ao servidor antes de deixar finalizar. Toda mexida reserva de novo com 700 ms de debounce; esvaziar chama `/cart/release`. **O admin não reserva**: reservar contra si mesmo tiraria da vitrine um estoque que ele já tem na mão. |
| `toast.ts` / `ToastProvider.tsx` | `useToast()`: `success` (some sozinho) e `error` (fica mais tempo). Avisos que não bloqueiam a tela, no lugar de `alert()`. |
| `confirm.ts` / `ConfirmProvider.tsx` | `useConfirm()`: diálogo de confirmação que resolve `true`/`false`, no lugar de `confirm()`. `tone: 'danger'` pinta o botão de vermelho; o rótulo é o verbo da ação ("Apagar"), não "Sim". |

### 5.3 `hooks/`

| Hook | Para quê |
|---|---|
| `useAsync` | A base das buscas: guarda dado, carregando e erro, descarta resposta atrasada e, por padrão, **mantém** a lista boa quando um refetch falha (`resetOnError` muda isso). |
| `useShowcase` / `useShowcaseFacets` | Vitrine pública **em lotes**: trocar filtro recomeça do primeiro lote, `loadMore` pede o seguinte pelo cursor, resposta de filtro antigo é descartada e produto repetido entre as fases (com estoque → esgotado) é ignorado. Manda o `cartToken` para o visitante não esconder de si mesmo o que acabou de escolher. As facets alimentam os chips com contagem. |
| `useShowcaseFilters` | Filtros da vitrine **na URL** (`?marca=Avon&promo=1`): o cabeçalho e a grade são componentes separados e a URL é o que os dois enxergam; um link filtrado abre filtrado. |
| `useProducts` | Estoque do admin (com `available`, lucro unitário e previsto já calculados pela API) e os tipos `Product`, `Brand`, `Category`. |
| `useCustomers` | Lista de clientes, reaproveitada pelo checkout e pelos cards de pedido; também os tipos do extrato. |
| `useCustomerPicker` | Busca de cliente do balcão: digitar filtra, escolher fixa, digitar de novo desfaz a escolha. Vazio é "Consumidor final". |
| `usePendingOrders` | Pedidos `PENDING` + o tipo `PendingOrder`, que descreve o contrato inteiro da tela de confirmação. |
| `useSalesList` / `useSalesReport` | Vendas por período e o relatório item a item do dashboard. `from` evita puxar o histórico inteiro a cada filtro. |
| `useDashboardSummary` | Indicadores do topo do dashboard. |
| `usePaymentOptions` | Opções de parcelamento **calculadas pelo servidor** + `totalsFor`, que escolhe a opção atual. Sem opção correspondente, cai no valor à vista em vez de inventar juros. |
| `useBagStock` | O que o estoque de agora diz da sacola: quanto cada item vende, o que não cabe mais e o "Ajustar tudo". Ao montar pergunta o servidor (o carrinho pode ter sobrevivido à reserva); enquanto isso só o estoque vira esqueleto. |
| `useDiscountInput` | O desconto digitado no balcão, em reais ou %. `inReais` já respeita o teto do total dos produtos (mesma regra do servidor); `rawInReais` é o digitado. |
| `useCoupons` / `useInstallmentPlans` | As duas metades de Ajustes: o CRUD de cupons e a tabela de juros, que é editada inteira e salva de uma vez (sem estado meio-salvo). |
| `useCountdown` | Segundos até `expiresAt`, de segundo em segundo (`formatCountdown` formata). Só o relógio que a pessoa vê — quem manda no vencimento é o servidor. |
| `useClickOutside` | Chama um callback quando o clique cai fora de um elemento; usado pelos menus. |

### 5.3a `services/` — a fronteira com a API

Uma função por chamada, agrupadas por assunto: `account` (login, cadastro, `/me`, troca de senha — que devolve o token novo), `catalog` (vitrine, facets, marcas, categorias, produtos e o envio de imagem), `checkout` (disponibilidade, reserva, opções de pagamento, cupom), `orders` (pedidos e vendas de balcão), `customers` (clientes, extrato, baixa de parcela), `settings` (juros e cupons) e `analytics`. As telas e os hooks importam daqui em vez de escrever URL.

### 5.4 `utils/`

| Arquivo | Conteúdo |
|---|---|
| `auth.ts` | Token no `localStorage`, leitura do payload, `isTokenValid` (sem isso a tela abre e todas as chamadas voltam 401), `getRole`/`isAdmin`/`isCustomer` — para decidir o que **mostrar**, nunca o que permitir. |
| `cartToken.ts` | Gera e guarda a identidade do carrinho no navegador; é o que liga carrinho e reservas antes de existir conta. |
| `formatters.ts` | `formatCurrency` (BRL), `parseCurrencyInput` (digita em centavos), `parsePercentInput` (digita direto, teto de 100) e formatadores de data. |
| `expiry.ts` | Status de validade (`expired`/`soon`/`ok`) com a mesma janela de 90 dias do backend (`lib/expiryWindow.ts`). |
| `errors.ts` | Extrai `{ error }` da resposta — sem isso o operador nunca descobre *por que* a ação falhou. |
| `installments.ts` | Simula juros, total e parcela de um parcelamento para a loja ver o efeito de uma taxa em Ajustes. Arredonda em centavos como o servidor. |
| `dashboardMonth.ts` | Meses do calendário e os baldes do gráfico do Dashboard (inclusive os vazios). |
| `shelfTone.ts` | A cor atrás do frasco quando não há foto, derivada do `id` — o mesmo produto tem a mesma cor em todo lugar. |
| `scrollFade.ts` | Marca no elemento (`data-more`) se há conteúdo para rolar, para o CSS desfocar a borda de uma lista cortada. |

### 5.5 `pages/`

| Página | Papel | O que ela resolve |
|---|---|---|
| `Home.tsx` | Vitrine (todos) | Única superfície de escolher produto, do visitante e de quem atende — por isso mostra números diferentes para cada um (disponível × físico). Destaques e chips com contagem vêm das facets; a grade carrega em lotes conforme a rolagem; filtros por marca, categoria, promoção e busca ficam na URL. |
| `Checkout.tsx` | Carrinho / fechamento (todos) | **Uma página, dois comportamentos.** Cliente logado → `POST /orders` (pedido pendente). Admin → `POST /sales` (venda de balcão, com cliente, desconto, forma de pagamento e parcelas). A página só monta: o estoque da sacola está em `useBagStock` e cada pedaço da tela em `components/checkout/`. |
| `Login.tsx` | Entrada | Um campo de identificação; admin cai no painel, cliente volta para onde estava (em geral o checkout que pediu o login). |
| `Register.tsx` | Cadastro | Recarrega ao fim para cabeçalho e carrinho enxergarem o novo papel. |
| `MyAccount.tsx` | Área do cliente | Perfil, troca de senha, histórico com parcelas e a "zona de perigo", cuja confirmação diz exatamente o que sai e o que fica. |
| `Dashboard.tsx` | Admin | Indicadores e gráficos (Recharts) com filtros por período/marca/categoria. Buckets vazios são criados primeiro, para o gráfico mostrar o período inteiro mesmo sem venda. |
| `Inventory.tsx` | Admin | Lista do estoque com validade, lucro e as duas quantidades. Abre o `ProductModal`. |
| `Sales.tsx` | Admin | Pedidos pendentes no topo (`PendingOrders`) e o histórico de vendas expansível, com busca e período. |
| `Customers.tsx` | Admin | Clientes com dívida, compras em aberto e atraso; abre o extrato. |
| `Settings.tsx` | Admin | Tabela de juros por parcelamento e gestão de cupons. |

Cada página tem um `.css` de mesmo nome ao lado.

### 5.6 `components/`

| Componente | Papel |
|---|---|
**Moldura e navegação**

| Componente | Papel |
|---|---|
| `Header.tsx` | O cabeçalho da loja: logo, `ShowcaseToolbar`, `BagPreview` e `AccountMenu`. O carrinho aparece para todo mundo — inclusive para quem não entrou, que é justamente quem precisa vê-lo para decidir criar conta. |
| `AdminSidebar.tsx` | A barra lateral do admin (recolhível, lembra a escolha no `localStorage`); mostra quantos pedidos esperam resposta. |
| `AccountMenu.tsx` | O ícone de perfil: "Meu perfil" e "Sair". Fecha com Esc ou clique fora. |
| `AuthShell.tsx` | A tela de acesso: painel verde com a razão de entrar e o formulário. Entrar e Criar conta são duas abas da mesma tela; o `?next=` atravessa as duas. |
| `Footer.tsx` / `Logo.tsx` | Rodapé com os links do autor; a marca em SVG, sem imagem. |

**Vitrine**

| Componente | Papel |
|---|---|
| `ShowcaseToolbar.tsx` | Busca e filtros da vitrine, ligados à URL por `useShowcaseFilters`; os chips vêm das facets. |
| `MultiSelect.tsx` | O filtro de várias opções com contagem (marca, categoria). |
| `BagPreview.tsx` | A prévia da sacola ao passar o mouse no cabeçalho, com atrasos para abrir e fechar não piscarem. |
| `ShowcaseSkeleton.tsx` | Esqueletos nos mesmos blocos da página carregada, para nada mudar de lugar quando os produtos chegam. |
| `LazyImage.tsx` | Foto que só baixa perto da tela e aparece com um esmaecer; o espaço dela já é reservado. |

**Checkout e vendas**

| Componente | Papel |
|---|---|
| `PendingOrders.tsx` | Os cards de pedido esperando resposta. Confirmar faz três coisas de uma vez (vincula cliente, revalida estoque, cria venda); recusar exige o motivo que o cliente vai ler. Abre já preenchido com o que o cliente pediu — e deixa mudar. |
| `PaymentPicker.tsx` | **Duas escolhas, não onze.** "À vista ou parcelado?" primeiro; o número de parcelas só aparece depois. Trava o fiado sem cliente. |
| `CouponField.tsx` | Campo de cupom que se reconfere sozinho quando o carrinho muda — um cupom de 10% sobre R$ 300 não pode continuar valendo R$ 30 depois de a pessoa remover metade dos itens. |
| `checkout/` | Os pedaços da página: `CheckoutHead`, `BagItem`, `EmptyBag`, `StockAlert` (itens que travam o envio, com "Ajustar tudo"), `ReservationTimer` (número + barra), `CustomerPanel` (pedido do cliente), `AdminPanel` (venda de balcão), `CustomerPicker`, `DiscountField`. Compartilham os tipos de `checkout/types.ts`. |

**Administração**

| Componente | Papel |
|---|---|
| `ProductModal.tsx` | Cadastro/edição de produto, envio da imagem (pede a URL assinada ao backend e sobe direto ao Storage) e gestão inline de marca/categoria. Avisa quando o nome vai **somar estoque** em vez de criar produto, usando o mesmo critério do backend. |
| `CustomerModal.tsx` | Criar/editar cliente. |
| `CustomerStatementPanel.tsx` | Painel do extrato do cliente e baixa de parcela; busca o histórico só quando um cliente é aberto. |
| `DropdownMenu.tsx` | Select com criar/renomear/apagar embutidos, usado para marca e categoria. |
| `DockingLabel.tsx` | O título de seção de Ajustes: uma palavra vem de baixo da janela e "encaixa" na palavra igual do título (o fio do topo da seção é desenhado por ela). |
| `settings/` | Os pedaços de Ajustes: `InstallmentPlans`, `PlanCell`, `PlanExample`, `SimulationBar`, `PlansSkeleton` (tabela de juros) e `Coupons`, `CouponTable`, `CouponFormPanel`, `CouponActions`, com `couponFormat.ts` e `types.ts`. |

---

## 6. Fluxos ponta a ponta

### 6.1 Visitante → pedido → venda

```
Vitrine (/)                GET /products/showcase/facets        → chips, total, destaques
                           GET /products/showcase?cartToken=…   → só o disponível, em lotes de 24
  ↓ addItem
CartProvider               POST /cart/reserve  (debounce 700 ms) → reserva 5 min
  ↓                        substitui as reservas do carrinho; não soma
Checkout                   POST /cart/availability              → confere o agora
  ↓ login (reserva vira 30 min)
POST /orders               Order PENDING · nenhum estoque baixa · cupom NÃO consumido
  ↓                        reservas passam a ter orderId (saem da conta de disponível)
notifyNewOrder             Telegram + e-mail, depois do commit, sem await
  ↓
Vendas → PendingOrders     GET /orders?status=PENDING
  ↓ confirmar
POST /orders/:id/confirm   vincula/cria Customer → revalida cupom → registerSale
                           → estoque baixa · parcelas nascem · reservas apagadas
```

Se o item saiu no balcão nesse intervalo, a confirmação **recusa dizendo qual
produto e quanto restou** (D2). Recusar o pedido (`/cancel`) guarda o motivo e
libera as reservas.

### 6.2 Venda de balcão

`Checkout` (admin) → `POST /sales` → `registerSale` na mesma transação. Sem
pedido, sem espera, sem reserva — o mesmo caminho de código da confirmação.

### 6.3 De onde vem cada número do total

| Número | Origem | Nunca vem de |
|---|---|---|
| Preço unitário | `getActivePrice` sobre o produto no banco | corpo da requisição (exceto o preço congelado do pedido, decidido pelo servidor) |
| Desconto de cupom | `checkCoupon` contra o subtotal real | tela |
| Taxa de juros | `InstallmentPlan` no banco | tela |
| Valor da parcela | `computeTotals` + `buildInstallments` | arredondamento da tela |

---

## 7. Variáveis de ambiente

**Backend** (`backend/.env`, modelo em `.env.example`):

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Postgres (Supabase). |
| `ADMIN_EMAIL` | sim | Login da administração — o admin não é um `User`. |
| `ADMIN_PASSWORD_HASH` | recomendada | Hash bcrypt gerado por `npm run hash-password`. |
| `ADMIN_PASSWORD` | alternativa | Funciona, mas mantém a senha em texto puro no ambiente; o log avisa. |
| `JWT_SECRET` | sim | Assina o token **com o papel** — vazar permite forjar acesso de admin. |
| `CORS_ORIGINS` | em produção | Lista separada por vírgula. Sem ela, a API aceita qualquer origem. |
| `TRUST_PROXY` | opcional | Quantos proxies existem à frente da API. Padrão 1 em produção e 0 fora; nunca `true`. Sem isso o rate limit enxerga o IP do proxy. |
| `PORT` | opcional | Porta da API (padrão 3001). |
| `NODE_ENV` | recomendada | `production` desliga o log de query do Prisma e exige `JWT_SECRET` de 32+ caracteres. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | para fotos | Assinam o envio da imagem de produto. A service role **nunca** vai ao frontend. Sem elas, o envio responde 503. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | opcional | Aviso de pedido novo. Sem elas, o canal é pulado. |
| `RESEND_API_KEY` / `ORDER_NOTIFICATION_FROM` / `ORDER_NOTIFICATION_EMAIL` | opcional | O mesmo aviso, por e-mail. |

**Frontend** (`frontend/.env`): `VITE_API_URL` (padrão `http://localhost:3001`),
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (envio da imagem de produto pela URL assinada). O Vite as embute no bundle, então precisam existir **antes do build**.

---

## 8. Pontos de atenção

Observados na leitura do código, para quem for continuar:

1. **`brands`/`categories` não validam duplicidade** — nada impede duas marcas
   com o mesmo nome, e o schema não tem `@unique` nesses campos.
2. **CORS aberto por padrão.** Sem `CORS_ORIGINS`, `origin: true` reflete
   qualquer origem; em produção isso só aparece como aviso no log.
3. **Testes e CI.** No backend, `npm test` roda os unitários e
   `npm run test:integration` os de integração, contra um Postgres descartável
   (`tests/docker-compose.yml`). No frontend, `npm test` roda os de comportamento.
   O CI (`.github/workflows/ci.yml`) roda tudo isso, mais `lint`, `build` e
   `npm audit` (só o nível crítico bloqueia). As capturas de tela do Playwright
   ficam **fora** do CI: as referências foram geradas no macOS.
4. **D1 tem um custo conhecido:** toda leitura de estoque vira uma agregação.
   Irrelevante nesta ordem de grandeza; se um dia pesar, o caminho é
   materializar `reservedQuantity` na mesma transação — depois de medir.
5. **Validade é por produto, não por lote.** Ao somar estoque, o `upsert` mantém
   a data mais próxima (a mais conservadora); controle real exigiria uma tabela
   de lotes.
6. **SQL cru não passa pela extensão de dinheiro** (D7). Quem escreve
   `$queryRaw` com coluna monetária converte centavos para reais por conta
   própria — hoje só a dívida em `customers.controller`.
