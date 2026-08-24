import { Router } from 'express';
import * as ProductController from '../controllers/products.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.get('/showcase', ProductController.getShowcase);
router.get('/', authMiddleware, requireAdmin, ProductController.getAll);
router.post('/', authMiddleware, requireAdmin, ProductController.upsert);
router.put('/:id', authMiddleware, requireAdmin, ProductController.update);
router.delete('/:id', authMiddleware, requireAdmin, ProductController.remove);

export default router;