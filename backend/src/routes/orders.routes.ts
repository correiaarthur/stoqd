import { Router } from 'express';
import * as OrderController from '../controllers/orders.controller.js';
import { authMiddleware, requireAdmin, requireCustomer } from '../middlewares/auth.js';
import { orderLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.use(authMiddleware);

router.post('/', orderLimiter, requireCustomer, OrderController.create);

router.get('/', requireAdmin, OrderController.list);
router.post('/:id/confirm', requireAdmin, OrderController.confirm);
router.post('/:id/cancel', requireAdmin, OrderController.cancel);

export default router;
