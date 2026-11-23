import { Router } from 'express';
import * as CouponController from '../controllers/coupons.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', CouponController.list);
router.post('/', CouponController.create);
router.put('/:id', CouponController.update);
router.delete('/:id', CouponController.remove);

export default router;
