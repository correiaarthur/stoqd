import { Router } from 'express';
import * as InstallmentController from '../controllers/installments.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.patch('/:id/pay', InstallmentController.pay);

export default router;