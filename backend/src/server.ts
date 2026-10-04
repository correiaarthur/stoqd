import { assertEnv, isProduction } from './lib/env.js';

// Roda antes do Express ser montado e, principalmente, antes do `listen`:
// nenhuma requisição é atendida por um processo mal configurado. (Não adianta
// tentar rodar isto "antes dos imports" — em ESM os imports são içados e os
// módulos avaliados primeiro; o que importa é chegar antes do `listen`.)
assertEnv();

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { limiter } from './middlewares/rateLimiter.js';

import analyticsRoutes from './routes/analytics.routes.js';
import authRouter from './routes/auth.routes.js';
import brandsRouter from './routes/brands.routes.js'; 
import cartRoutes from './routes/cart.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import couponsRoutes from './routes/coupons.routes.js';
import customersRoutes from './routes/customers.routes.js';
import installmentsRoutes from './routes/installments.routes.js';
import meRoutes from './routes/me.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import productsRouter from './routes/products.routes.js';
import salesRoutes from './routes/sales.routes.js';
import settingsRoutes from './routes/settings.routes.js';


const app = express();

/**
 * Atrás de um proxy (Render, Railway, Fly, Nginx), `req.ip` é o IP do proxy —
 * o mesmo para todo mundo. Sem isto, o rate limit vira um balde único
 * compartilhado: as 10 tentativas de login por 15 minutos passariam a valer
 * para a internet inteira, e o primeiro a errar a senha trancaria os demais.
 *
 * O valor é o número de proxies à frente, nunca `true`: com `true` o Express
 * confia no `X-Forwarded-For` inteiro, e aí qualquer um forja um IP por
 * requisição e fura o limite de vez.
 */
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY ?? (isProduction ? 1 : 0));

if (TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', TRUST_PROXY_HOPS);
}

app.use(helmet());

// Em produção, só as origens declaradas em CORS_ORIGINS (separadas por vírgula).
// Sem a variável, reflete a origem da requisição — cômodo no desenvolvimento
// local, mas equivale a liberar geral.
const allowedOrigins = process.env.CORS_ORIGINS
  ?.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins?.length ? allowedOrigins : true
}));

app.use(limiter);

app.use(express.json());

app.use('/analytics', analyticsRoutes);
app.use('/auth', authRouter);
app.use('/brands', brandsRouter);
app.use('/cart', cartRoutes);
app.use('/categories', categoriesRoutes);
app.use('/coupons', couponsRoutes);
app.use('/customers', customersRoutes);
app.use('/installments', installmentsRoutes);
app.use('/me', meRoutes);
app.use('/orders', ordersRoutes);
app.use('/payment', paymentRoutes);
app.use('/products', productsRouter);
app.use('/sales', salesRoutes);
app.use('/settings', settingsRoutes);

app.get('/', (_req: Request, res: Response) => {
  res.send('API do Estoque está rodando! 🚀');
});

/**
 * O app montado, sem escutar porta.
 *
 * Exportado para o teste de autorização poder subi-lo numa porta efêmera: essa
 * verificação mora na costura entre rota e middleware, então precisa do app
 * inteiro — e importar um módulo que chama `listen` no topo deixaria um servidor
 * pendurado em porta fixa a cada execução.
 */
export { app };

const PORT = process.env.PORT || 3001;

// `listen` só quando este arquivo é o ponto de entrada. Importado por um teste,
// o app fica disponível e quem decide a porta é quem importou.
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}