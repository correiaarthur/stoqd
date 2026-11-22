import { Router } from 'express';
import * as ProductController from '../controllers/products.controller.js';
import { adminOnly } from '../middlewares/auth.js';

const router = Router();

router.get('/showcase', ProductController.getShowcase);
router.get('/showcase/facets', ProductController.getShowcaseFacets);
router.get('/', adminOnly, ProductController.getAll);
router.post('/', adminOnly, ProductController.upsert);
router.put('/:id', adminOnly, ProductController.update);
router.delete('/:id', adminOnly, ProductController.remove);

export default router;