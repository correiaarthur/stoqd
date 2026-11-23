import { Router } from 'express';
import * as PaymentController from '../controllers/payment.controller.js';
import { couponLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.get('/options', PaymentController.options);
router.post('/coupons/validate', couponLimiter, PaymentController.validateCoupon);

export default router;
