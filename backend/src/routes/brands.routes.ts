import { Router } from 'express';
import * as BrandController from '../controllers/brands.controller.js';
import { adminOnly } from '../middlewares/auth.js';

const router = Router();

router.get('/', BrandController.getAll);
router.post('/', adminOnly, BrandController.create);
router.put('/:id', adminOnly, BrandController.update);
router.delete('/:id', adminOnly, BrandController.remove);

export default router;