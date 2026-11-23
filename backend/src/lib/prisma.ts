import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { moneyExtension } from './moneyColumns.js';

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });

// Em produção o log de query despeja todo o SQL — com dados de clientes e
// vendas — no stdout do servidor.
const isProduction = process.env.NODE_ENV === 'production';

// O dinheiro é guardado em centavos inteiros; a extensão converte na fronteira, e o
// resto do código segue falando em reais. Ver `lib/moneyColumns.ts`.
export const prisma = new PrismaClient({
    adapter,
    log: isProduction ? ['warn', 'error'] : ['query', 'warn', 'error']
}).$extends(moneyExtension);

