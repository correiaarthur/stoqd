import { Router } from 'express';
import * as SalesController from '../controllers/sales.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', SalesController.list);
router.post('/', SalesController.create);   

export default router;