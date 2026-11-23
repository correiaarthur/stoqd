import { Router } from 'express';
import * as CartController from '../controllers/cart.controller.js';
import { optionalAuth } from '../middlewares/auth.js';
import { cartLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// Rotas públicas que escrevem: além do limite geral, cada uma tem o seu.
// `optionalAuth` só serve para saber se a reserva vale 5 ou 30 minutos.
router.use(cartLimiter, optionalAuth);

router.post('/reserve', CartController.reserve);
router.post('/availability', CartController.availability);
router.post('/release', CartController.release);

export default router;
