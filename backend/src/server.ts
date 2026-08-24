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

app.use(helmet());

// Em produção, só as origens declaradas em CORS_ORIGINS (separadas por vírgula).
// Sem a variável, reflete a origem da requisição — cômodo no desenvolvimento
// local, mas equivale a liberar geral.
const allowedOrigins = process.env.CORS_ORIGINS
  ?.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (!allowedOrigins?.length && process.env.NODE_ENV === 'production') {
  console.warn('[cors] CORS_ORIGINS não definido: a API está aceitando qualquer origem.');
}

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});