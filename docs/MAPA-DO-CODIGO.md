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
│   └── src/
│       ├── server.ts         Sobe o Express, monta middlewares e routers
│       ├── routes/           Um arquivo por recurso: caminho + quem pode
│       ├── controllers/      Um arquivo por recurso: HTTP in, HTTP out
│       ├── services/         Casos de uso que orquestram transações (hoje: pedidos)
│       ├── lib/              Regra de negócio, sem Express
│       ├── middlewares/      Autenticação/autorização e limites por rota
│       └── scripts/          Tarefas manuais (hash de senha, consolidação)
│
└── frontend/                 SPA (React 19 + Vite + React Router 7)
    └── src/
        ├── App.tsx           Rotas e guardas por papel
        ├── api.ts            Axios com interceptors de token e 401
        ├── pages/            Uma tela por arquivo (+ o CSS ao lado)
        ├── components/       Pedaços reutilizados entre telas
        ├── contexts/         Carrinho (estado global de verdade)
        ├── hooks/            Busca de dados e relógio da reserva
        ├── utils/            Token, formatação, erros, validade
        └── lib/supabase.ts   Cliente do Storage, só para imagem de produto
```

**Camadas do backend, em uma frase:** `routes` decide *quem pode chamar*,
`controllers` traduz HTTP em chamada de regra, `services` executa um caso de uso
inteiro numa transação (hoje, o ciclo de vida do pedido) e `lib` contém as regras
puras que eles usam.

---

## 2. As decisões que explicam o código

Seis decisões respondem pela maior parte do que parece estranho à primeira
leitura. Elas aparecem citadas nos comentários do código.

| # | Decisão | Onde vive |
|---|---|---|
| **D1** | **Disponível nunca é armazenado, sempre derivado.** Disponível = `Product.quantity` − reservas ativas, calculado na leitura. Não existe job liberando reserva vencida: ela deixa de contar no instante em que vence. | `lib/availability.ts` |
| **D2** | **O balcão ganha da reserva.** Quem está com o produto na mão vende. A venda confere o estoque **físico**; um pedido online pode ser recusado na confirmação porque o item saiu na loja. | `lib/sales.ts`, `services/orders.service.ts` |
| **D3** | **Pedido não é venda.** O pedido nasce `PENDING`, não baixa estoque e não gasta cupom. Só a confirmação cria a `Sale` — pelo mesmo caminho da venda de balcão. | `services/orders.service.ts` |
| **D4** | **Conta de acesso ≠ cliente.** `User` guarda login; `Customer` guarda histórico. Apagar a conta não apaga as vendas. O vínculo nasce na confirmação de um pedido, quando uma pessoa reconhece a outra. | `schema.prisma`, `me.controller.ts` |
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
| `src/server.ts` | Monta o Express na ordem `helmet` → `cors` → `limiter` → `express.json()` → routers. Sem `CORS_ORIGINS` a API reflete qualquer origem — cômodo no desenvolvimento, avisado no log em produção. |
| `prisma.config.ts` | Aponta o Prisma CLI para o schema e para as migrations. |
| `package.json` | `npm run dev` (tsx watch), `npm run hash-password`, `npm test` (unitários) e `npm run test:integration` (contra um Postgres descartável). |
| `.env.example` | Documenta cada variável, inclusive as opcionais do aviso de pedido. É a referência da seção 7. |
| `tsconfig.json` | ESM (`"type": "module"`), por isso todo import interno termina em `.js`. |

### 3.2 Modelo de dados — `prisma/schema.prisma`

| Model | Papel | Detalhe que importa |
|---|---|---|
| `Brand` / `Category` | Taxonomia do catálogo. | Apagar marca **cascateia** nos produtos; categoria só desvincula (`categoryId` é opcional). |
| `Product` | Item do catálogo. `name` é `@unique`. | Guarda uma única `expiryDate` — sem controle por lote. `quantity` é o físico; o disponível é derivado (D1). |
| `Customer` | Quem aparece nas vendas. | Existe sem conta; `user` é o lado inverso do vínculo opcional. |
| `Sale` | Venda registrada. | `discount` e `interest` ficam separados do `total` para o faturamento não confundir juros com venda de produto. `couponId` fica guardado para auditoria. |
| `SaleItem` | Linha da venda com `unitPrice` congelado. | O preço fica na venda, não no produto: mudar o preço não reescreve o passado. |
| `Installment` | Parcela com `dueDate` e `paidAt`. | `paidAt = null` é o que define pendência e atraso em toda a UI. |
| `User` | Conta de acesso (D4). | Login pelo `phone` (só dígitos, `@unique`); `email` opcional e único quando presente. `role` default `customer`. |
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
| `saleInput.ts` | O corpo da venda de balcão e as consultas (lista de vendas, relatório, subtotal). | O relatório exige `from`: sem período puxaria o histórico inteiro. |
| `adminCredentials.ts` | Compara a senha do admin por bcrypt, com cache do hash. | Sem `ADMIN_PASSWORD_HASH`, gera o hash de `ADMIN_PASSWORD` na subida e avisa. |
| `tokens.ts` | **Emitir e verificar o token — e poder revogá-lo.** `signCustomerToken` (leva `tv`, a versão da sessão), `signAdminToken` (leva `cf`, a impressão digital das credenciais do `.env`) e `verifyAuthToken`. | Cliente: o token só vale se `tv` for igual a `User.tokenVersion`; trocar a senha incrementa, e apagar a conta apaga a linha — uma leitura por chave primária a cada requisição. Admin: sem linha no banco, a revogação vem de a credencial mudar (HMAC de e-mail + hash, ou a senha em texto, que não leva sal novo a cada reinício). Token de cliente sem `tv` vale como 0, para ninguém cair no deploy; token de admin sem `cf` é recusado. |
| `notifications.ts` | Avisa **a loja** de pedido novo, por Telegram e Resend. | Cada canal no seu try/catch; nunca lança. Falha de aviso não derruba pedido. Loga só o status HTTP, para não vazar token. |
| `prismaErrors.ts` | Traduz P2002/P2003/P2025 em 409/409/404 com texto que o operador entende. | Lê `error.code` como string em vez de importar a classe do Prisma, que muda de lugar entre versões. |

### 3.4 `src/middlewares/`

| Arquivo | Conteúdo |
|---|---|
| `auth.ts` | `authMiddleware` (exige token válido **e não revogado**, com papel), `optionalAuth` (token ruim ou revogado = visitante), `requireAdmin`, `requireCustomer`. | Token sem papel é recusado — um token antigo não vira admin por omissão. A verificação mora em `lib/tokens.ts`. |
| `rateLimiter.ts` | Seis limitadores, cada um dimensionado pelo que a rota faz: geral 600/15min · login 10/15min (sucesso não conta) · cadastro 5/h · carrinho 120/15min · pedido 10/15min · cupom 20/15min. |

### 3.4a `src/services/` — o ciclo de vida do pedido

`orders.service.ts` tem os quatro casos de uso do pedido, cada um numa transação.
Os erros de regra saem como `DomainError`, com o status HTTP junto, e o controller
só os traduz.

| Função | O que faz |
|---|---|
| `createOrder` | Confere o limite de 3 pedidos pendentes por conta, o estoque de cada item (a reserva do próprio carrinho não conta contra ele) e o parcelamento e o cupom pedidos; congela o preço que a pessoa viu, grava o pedido `PENDING`, prende as reservas do carrinho a ele por 30 minutos e, **depois do commit e sem `await`**, avisa a loja. |
| `listOrders` | Lê os pedidos e três coisas independentes em paralelo (estoque, planos de parcelamento, candidatos a cliente) e entrega tudo a `lib/orderView.ts`, que monta a resposta. |
| `confirmOrder` | Em passos nomeados: `claimPendingOrder` (reivindica o pedido **no próprio UPDATE**, para dois cliques simultâneos não gerarem duas vendas), `linkCustomer`, `couponForSale` e `registerSale`. Se qualquer passo falha, a transação inteira reverte e o pedido continua pendente. |
| `cancelOrder` | Só recusa pedido pendente, guarda o motivo e solta as reservas dele. |

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
| `me.controller.ts` | Área do cliente: ver/editar conta, trocar senha (exige a atual; **encerra as outras sessões** e devolve um token novo para esta; senha atual errada é 400, não 401, para o cliente web não tratar como sessão expirada), excluir o perfil (apaga só o `User`) e histórico de compras. `PUBLIC_FIELDS` garante que o hash nunca sai numa resposta. |
| `cart.controller.ts` | `reserve` (substitui as reservas do carrinho — repetir a chamada não deixa órfã), `availability` (consulta sem reservar) e `release`. |
| `orders.controller.ts` | Só o HTTP do pedido: lê a requisição (`orderInput.ts`), chama `services/orders.service.ts` e responde. `create` (pedido `PENDING`), `list` (tela de Vendas), `confirm` e `cancel`. A regra mora no service; o controller tem cerca de 70 linhas. |
| `sales.controller.ts` | `create` (venda de balcão — ignora de propósito o `unitPrice` que vier no corpo) e `list` com filtro de período/cliente e teto de 200. |
| `products.controller.ts` | `upsert` com custo médio ponderado e validade mais conservadora; `update`; `remove` (recusa produto já vendido); `getAll` (admin vê físico **e** disponível); `getShowcase` (público, só o disponível). |
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
| `merge-duplicate-products.ts` | Consolidação pontual: junta produtos de nome duplicado (soma quantidade, custo médio ponderado ignorando custo 0, mantém a validade mais próxima, reaponta itens de venda) antes de a constraint `@unique` ser aplicada. Já cumpriu o papel; fica como registro. |

### 3.7 `prisma/migrations/`

A linha do tempo do banco, e a leitura mais rápida da evolução do produto:

`init_inventory` → `ajuste_float` → `cria_tabela_vendas` → `adiciona_clientes_e_parcelas`
→ `add_image_url` → `add_categories_promotions_cascade` → `add_discount_to_sale`
→ `reconcile_schema_drift` → `add_product_name_unique` → **`add_users_reservations_orders`**
(a vitrine com carrinho) → `phone_as_login_email_optional` → `coupons_and_installment_interest`
→ `installment_plans_up_to_12` → `interest_free_up_to_3x` → `gradual_interest_ladder`.

---

## 4. Mapa das rotas da API

**Público** — sem token:

| Método | Rota | Limite | Nota |
|---|---|---|---|
| GET | `/` | geral | Health check. |
| POST | `/auth/login` | 10/15min | Sucesso não conta no limite. |
| POST | `/auth/register` | 5/hora | Devolve token de cliente já pronto. |
| GET | `/products/showcase` | geral | Aceita `?cartToken=` para não descontar a própria reserva. |
| GET | `/brands`, `/categories` | geral | Só leitura; escrita é de admin. |
| POST | `/cart/reserve`, `/cart/availability`, `/cart/release` | 120/15min | `optionalAuth`: com token, a reserva vale 30 min em vez de 5. |
| GET | `/payment/options` | geral | `?subtotal=` devolve o valor de cada parcela pronto. |
| POST | `/payment/coupons/validate` | 20/15min | Informativo; quem decide é a venda. |

**Cliente** — `authMiddleware` + `requireCustomer`:

| Método | Rota | Nota |
|---|---|---|
| GET / PUT / DELETE | `/me` | `DELETE` apaga a conta e preserva `Customer` e vendas (D4). |
| PUT | `/me/password` | Exige a senha atual. |
| GET | `/me/orders` | Pedidos + parcelas pagas/pendentes. |
| POST | `/orders` | 10/15min. Máximo de 3 pedidos pendentes por conta. |

**Administração** — `authMiddleware` + `requireAdmin`:

| Método | Rota | Nota |
|---|---|---|
| GET | `/analytics/summary`, `/analytics/sales-report` | Indicadores do dashboard. |
| GET / POST | `/sales` | `POST` é a venda de balcão. |
| GET | `/orders?status=` | `PENDING` (padrão), `CONFIRMED`, `CANCELLED`, `ALL`. |
| POST | `/orders/:id/confirm`, `/orders/:id/cancel` | Confirmar cria a venda; recusar exige motivo. |
| GET / POST / PUT / DELETE | `/products` | `POST` é upsert por nome. |
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
| `App.tsx` | `BrowserRouter` → `CartProvider` → `Header` / rotas / `Footer`. Define `AdminRoute` e `CustomerRoute` — que existem para a pessoa não cair numa tela que não é dela; **quem decide o que pode é o servidor**. `/pdv` redireciona para `/checkout`. |
| `api.ts` | Axios com `VITE_API_URL`. Interceptor de request injeta o token; o de response trata 401 limpando o token e mandando ao login — menos no próprio login, onde a mensagem já aparece na tela. |
| `vite.config.ts` / `vercel.json` | Build com plugin React; o rewrite manda tudo para `index.html` (SPA com rotas do lado do cliente). |
| `index.css` | Design system: variáveis de cor, tipografia (Syne/Be Vietnam Pro/Inter), reset e classes base (`.base-card`, `.btn-primary`, `.page-container`). Tema escuro. |
| `lib/supabase.ts` | Cliente do Supabase Storage — usado **só** para o upload de imagem de produto (bucket `produtos`). |

**Rotas da SPA:** `/` vitrine · `/login` · `/cadastro` · `/checkout` (público) ·
`/minha-conta` (cliente) · `/dashboard`, `/estoque`, `/vendas`, `/customers`,
`/ajustes` (admin).

### 5.2 `contexts/` — o carrinho

| Arquivo | Conteúdo |
|---|---|
| `cart.ts` | Tipos e `useCart()`. Documenta a diferença entre `available` (o que o visitante pode levar) e `quantity` (o que o balcão respeita, D2). |
| `CartProvider.tsx` | O carrinho vive no `localStorage` e **não depende da reserva** — por isso o checkout pergunta a disponibilidade ao servidor antes de deixar finalizar. Toda mexida reserva de novo com 700 ms de debounce; esvaziar chama `/cart/release`. **O admin não reserva**: reservar contra si mesmo tiraria da vitrine um estoque que ele já tem na mão. |

### 5.3 `hooks/`

| Hook | Para quê |
|---|---|
| `useShowcase` | Vitrine pública; manda o `cartToken` para o visitante não esconder de si mesmo o que acabou de escolher. |
| `useProducts` | Estoque do admin (com `available`, lucro unitário e previsto já calculados pela API). |
| `useCustomers` | Lista de clientes, reaproveitada pelo checkout e pelos cards de pedido. |
| `usePendingOrders` | Pedidos `PENDING` + o tipo `PendingOrder`, que descreve o contrato inteiro da tela de confirmação. |
| `useSalesList` / `useSalesReport` | Vendas por período e o relatório item a item do dashboard. `from` evita puxar o histórico inteiro a cada filtro. |
| `useDashboardSummary` | Indicadores do topo do dashboard. |
| `usePaymentOptions` | Opções de parcelamento **calculadas pelo servidor** + `totalsFor`, que escolhe a opção atual. Sem opção correspondente, cai no valor à vista em vez de inventar juros. |
| `useCountdown` | Segundos até `expiresAt`, de segundo em segundo. Só o relógio que a pessoa vê — quem manda no vencimento é o servidor. |

### 5.4 `utils/`

| Arquivo | Conteúdo |
|---|---|
| `auth.ts` | Token no `localStorage`, leitura do payload, `isTokenValid` (sem isso a tela abre e todas as chamadas voltam 401), `getRole`/`isAdmin`/`isCustomer` — para decidir o que **mostrar**, nunca o que permitir. |
| `cartToken.ts` | Gera e guarda a identidade do carrinho no navegador; é o que liga carrinho e reservas antes de existir conta. |
| `formatters.ts` | `formatCurrency` (BRL), `parseCurrencyInput` (digita em centavos) e `parsePercentInput` (digita direto, teto de 100). |
| `expiry.ts` | Status de validade (`expired`/`soon`/`ok`) com a mesma janela de 90 dias do backend. |
| `errors.ts` | Extrai `{ error }` da resposta — sem isso o operador nunca descobre *por que* a ação falhou. |

### 5.5 `pages/`

| Página | Papel | O que ela resolve |
|---|---|---|
| `Home.tsx` | Vitrine (todos) | Única superfície de escolher produto, do visitante e de quem atende — por isso mostra números diferentes para cada um (disponível × físico). Filtros por marca, categoria e busca. |
| `Checkout.tsx` | Carrinho / fechamento (todos) | **Uma página, dois comportamentos.** Cliente logado → `POST /orders` (pedido pendente). Admin → `POST /sales` (venda de balcão, com cliente, desconto, forma de pagamento e parcelas). Traz `ReservationTimer` (número + barra), o bloco de itens que travam o envio com "Ajustar tudo", `CustomerPanel` e `AdminPanel`. É o maior arquivo do frontend. |
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
| `Header.tsx` | Navegação por papel. O carrinho aparece para todo mundo — inclusive para quem não entrou, que é justamente quem precisa vê-lo para decidir criar conta. |
| `Footer.tsx` | Rodapé com os links do autor. |
| `PendingOrders.tsx` | Os cards de pedido esperando resposta. Confirmar faz três coisas de uma vez (vincula cliente, revalida estoque, cria venda); recusar exige o motivo que o cliente vai ler. Abre já preenchido com o que o cliente pediu — e deixa mudar. |
| `PaymentPicker.tsx` | **Duas escolhas, não onze.** "À vista ou parcelado?" primeiro; o número de parcelas só aparece depois. Trava o fiado sem cliente. |
| `CouponField.tsx` | Campo de cupom que se reconfere sozinho quando o carrinho muda — um cupom de 10% sobre R$ 300 não pode continuar valendo R$ 30 depois de a pessoa remover metade dos itens. |
| `ProductModal.tsx` | Cadastro/edição de produto, upload de imagem para o Supabase Storage e gestão inline de marca/categoria. Avisa quando o nome vai **somar estoque** em vez de criar produto, usando o mesmo critério do backend. |
| `CustomerModal.tsx` | Criar/editar cliente. |
| `CustomerStatementModal.tsx` | Extrato do cliente e baixa de parcela; busca o histórico só quando um cliente é aberto. |
| `DropdownMenu.tsx` | Select com criar/renomear/apagar embutidos, usado para marca e categoria. |

---

## 6. Fluxos ponta a ponta

### 6.1 Visitante → pedido → venda

```
Vitrine (/)                GET /products/showcase?cartToken=…   → só o disponível
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
| `NODE_ENV` | recomendada | `production` desliga o log de query do Prisma. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | opcional | Aviso de pedido novo. Sem elas, o canal é pulado. |
| `RESEND_API_KEY` / `ORDER_NOTIFICATION_FROM` / `ORDER_NOTIFICATION_EMAIL` | opcional | O mesmo aviso, por e-mail. |

**Frontend** (`frontend/.env`): `VITE_API_URL` (padrão `http://localhost:3001`),
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (upload de imagem de produto).

---

## 8. Pontos de atenção

Observados na leitura do código, para quem for continuar:

1. **`brands`/`categories` não validam duplicidade** — nada impede duas marcas
   com o mesmo nome, e o schema não tem `@unique` nesses campos.
2. **CORS aberto por padrão.** Sem `CORS_ORIGINS`, `origin: true` reflete
   qualquer origem; em produção isso só aparece como aviso no log.
3. **Testes.** `npm test` roda os unitários (as regras puras e os schemas) e
   `npm run test:integration` roda os de integração, contra um Postgres
   descartável (`tests/docker-compose.yml`).
4. **D1 tem um custo conhecido:** toda leitura de estoque vira uma agregação.
   Irrelevante nesta ordem de grandeza; se um dia pesar, o caminho é
   materializar `reservedQuantity` na mesma transação — depois de medir.
5. **Validade é por produto, não por lote.** Ao somar estoque, o `upsert` mantém
   a data mais próxima (a mais conservadora); controle real exigiria uma tabela
   de lotes.
6. **`merge-duplicate-products.ts` já cumpriu o papel** e roda contra o banco de
   produção: é script de uma vez só, não rotina.
