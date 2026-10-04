# ▲ stoqd 

O **stoqd** é um sistema *full-stack* de Gestão de Estoque e Vendas desenvolvido para automatizar e otimizar as operações de um negócio de varejo. O projeto centraliza o controle de produtos, fluxo de caixa e gestão de vendas a prazo — e, pela vitrine pública, permite que o cliente monte o carrinho e envie um pedido que só vira venda quando a loja confirma.

## 🛠️ Arquitetura e Tecnologias

A aplicação foi projetada utilizando uma arquitetura **Cliente-Servidor (API REST + SPA)**, com uma separação rigorosa de responsabilidades e forte ênfase na modelagem de dados, segurança e regras de negócio no servidor.

### Backend (Core do Sistema)
- **Node.js** com **Express** para roteamento ágil e estruturação da API REST.
- **TypeScript** garantindo tipagem estática ponta a ponta e previsibilidade no fluxo de dados.
- **Prisma ORM** para a modelagem relacional de dados, validação e versionamento seguro do banco via migrations.
- **PostgreSQL** (Hospedado via **Supabase**) escolhido pela conformidade ACID, garantindo a integridade das transações de vendas e do registro de parcelas.
- **Segurança:** JWT com **papel** (`admin` ou `customer`) verificado em cada rota — autenticar não é autorizar, e um token de cliente recebe 403 em qualquer rota de administração. Senhas em **bcrypt**, headers protegidos com **Helmet** e limites por rota com **Express Rate Limit** (cadastro, carrinho e pedido têm tetos próprios, por serem rotas públicas que escrevem).

### Frontend
- **React 19** com **Vite** para um ambiente de desenvolvimento rápido e otimizado da SPA.
- **TypeScript** para escalabilidade e prevenção de erros de tempo de execução.
- **Axios** (com *interceptors*) para comunicação segura e envio automático de tokens de autorização.
- **Recharts** para a renderização do Dashboard analítico.
- **CSS Customizado** (Variáveis globais, CSS Reset e Design System próprio, garantindo alta performance sem dependência de bibliotecas pesadas de UI).

## ✨ Funcionalidades Principais

- **Vitrine com carrinho:** A vitrine é a única superfície de escolher produto — do visitante e de quem atende. O checkout é uma página só com dois comportamentos: o cliente logado cria um **pedido pendente**; o admin fecha a **venda de balcão** direto, com cliente, desconto, forma de pagamento e parcelas.
- **Reserva de estoque por 5 minutos:** O disponível nunca é armazenado, sempre derivado — quantidade física menos as reservas ativas, calculado na leitura. Não há job liberando reserva vencida: ela deixa de contar no instante em que vence. Depois do login o prazo passa a 30 minutos.
- **Pedidos com confirmação manual:** O pedido não baixa estoque. Ao confirmar, a loja vincula (ou cria) o cliente, revalida o estoque e a venda nasce pelo mesmo caminho da venda de balcão. Se o item saiu na loja no intervalo, a confirmação recusa dizendo qual produto — **o balcão sempre ganha da reserva**, porque quem está com o produto na mão vende.
- **Aviso de pedido novo:** Telegram e e-mail, os dois para a administração. Cada envio é isolado: um canal fora do ar não impede o outro, e falha de aviso nunca derruba o pedido.
- **Área do cliente:** Dados da conta, troca de senha, histórico de compras com parcelas pagas e pendentes, e exclusão do perfil — que apaga a conta de acesso e preserva o cliente e as vendas, porque o histórico da loja é dela também.
- **Gestão de Vendas a Prazo:** Controle rigoroso de parcelas atreladas a clientes, com status dinâmico de pendência e cruzamento de datas de vencimento.
- **Dashboard de Analytics:** Visão financeira em tempo real do faturamento mensal, capital imobilizado em estoque e projeção de lucro.
- **Gestão de Inventário:** CRUD completo de produtos com categorização por marcas e alertas automáticos de baixo estoque.
- **Histórico de Clientes:** Extrato detalhado cruzando o histórico de compras, pagamentos realizados e a soma de débitos em aberto.

## ⚙️ Como rodar o projeto localmente

### Pré-requisitos
- Node.js (v18 ou superior)
- Um banco de dados PostgreSQL (ou conta no Supabase)

### 1. Clonar o repositório
```bash
git clone [https://github.com/seu-usuario/stoqd.git](https://github.com/seu-usuario/stoqd.git)
cd stoqd
```

### 2. Configurar o Backend
```bash
cd backend
npm install
```
Crie um arquivo `.env` na pasta `backend` a partir de `.env.example` — ele documenta cada variável, incluindo as opcionais do aviso de pedido (Telegram e e-mail).

A senha do admin é comparada por bcrypt. Gere o hash e guarde em `ADMIN_PASSWORD_HASH`:
```bash
npm run hash-password -- "sua-senha"
```
Sem essa variável o servidor ainda sobe usando `ADMIN_PASSWORD`, gerando o hash na inicialização e avisando no log — funciona, mas mantém a senha em texto puro no ambiente.

Rode as migrações para construir as tabelas no banco de dados:
```bash
npx prisma migrate dev
```

### 3. Configurar o Frontend
Acesse a pasta do frontend e instale as dependências:
```bash
cd ../frontend
npm install
```
Crie um `.env` a partir de `.env.example`. Em desenvolvimento `VITE_API_URL` pode ficar em branco (o padrão é `http://localhost:3001`); as variáveis do Supabase são necessárias para o upload das fotos.

### 4. Subir backend e frontend juntos
Na raiz do projeto, instale as dependências do orquestrador e suba os dois de uma vez:
```bash
cd ..
npm install
npm start
```
O `npm start` roda o backend (porta `3001`) e o frontend (porta `5173`) no mesmo terminal, com os logs prefixados por `[backend]` e `[frontend]`. Um `Ctrl+C` derruba os dois, e se um deles falhar ao subir o outro é encerrado junto.

Atalhos disponíveis na raiz:

| Comando | O que faz |
| --- | --- |
| `npm start` (ou `npm run dev`) | Sobe backend e frontend juntos |
| `npm run dev:backend` | Sobe só o backend |
| `npm run dev:frontend` | Sobe só o frontend |
| `npm run install:all` | Instala as dependências das duas pastas |
| `npm run build` | Compila os dois para produção |
| `npm run lint` | Roda o ESLint no frontend |

Se preferir terminais separados, os `npm run dev` dentro de `backend/` e `frontend/` continuam funcionando como antes.

---

## 🚀 Deploy

O backend valida o ambiente ao subir: faltando `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` ou a senha do admin, o processo encerra listando o que falta em vez de subir quebrado e falhar só no primeiro login.

### Backend (Render, Railway, Fly...)
| | |
| --- | --- |
| Build | `npm run build` (roda `prisma generate` e compila para `dist/`) |
| Start | `npm start` (`node dist/server.js`) |
| Migrações | `npm run migrate:deploy` antes do primeiro start |

Variáveis obrigatórias: `DATABASE_URL`, `JWT_SECRET` (mínimo 32 caracteres em produção), `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `CORS_ORIGINS` e `NODE_ENV=production`. O `.env.example` documenta cada uma.

`TRUST_PROXY` já assume `1` em produção, que é o certo para serviço gerenciado. Sem isso o rate limit enxergaria o IP do proxy no lugar do IP de quem chamou, e as tentativas de login de todos os visitantes cairiam no mesmo balde.

### Frontend (Vercel)
`VITE_API_URL` precisa estar configurada **no projeto da Vercel antes do build** — o Vite embute o valor no bundle, então definir depois não adianta e o site publicado sai chamando `localhost:3001`. As duas variáveis do Supabase seguem a mesma regra.

---

## 📚 Documentação do código

O [**mapa do código**](docs/MAPA-DO-CODIGO.md) descreve o que cada arquivo faz e por quê: as decisões que explicam o desenho (reserva derivada, balcão × pedido, conta ≠ cliente), o modelo de dados, o mapa das rotas com as permissões de cada uma e os fluxos ponta a ponta.

---

## 👨‍💻 Autor

[**Arthur Correia**](https://www.linkedin.com/in/arthur-correia-b7b883222/)

Graduando em Ciência da Computação pela UFCG e desenvolvedor com foco em sistemas backend.
