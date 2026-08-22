import { Router } from 'express';
import * as BrandController from '../controllers/brands.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.get('/', BrandController.getAll);
router.post('/', authMiddleware, BrandController.create);
router.put('/:id', authMiddleware, BrandController.update);
router.delete('/:id', authMiddleware, BrandController.remove);

export default router;