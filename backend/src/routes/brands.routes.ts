import { Router } from 'express';
import * as BrandController from '../controllers/brands.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.get('/', BrandController.getAll);
router.post('/', authMiddleware, requireAdmin, BrandController.create);
router.put('/:id', authMiddleware, requireAdmin, BrandController.update);
router.delete('/:id', authMiddleware, requireAdmin, BrandController.remove);

export default router;