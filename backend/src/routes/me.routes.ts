import { Router } from 'express';
import * as MeController from '../controllers/me.controller.js';
import { authMiddleware, requireCustomer } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware, requireCustomer);

router.get('/', MeController.show);
router.put('/', MeController.update);
router.put('/password', MeController.changePassword);
router.delete('/', MeController.remove);
router.get('/orders', MeController.orders);

export default router;
