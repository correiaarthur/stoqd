import { Router } from 'express';
import { getAll, create, update, remove } from '../controllers/categories.controller.js';
import { adminOnly } from '../middlewares/auth.js';

const router = Router();

router.get('/', getAll); 

router.post('/', adminOnly, create);
router.put('/:id', adminOnly, update);
router.delete('/:id', adminOnly, remove);

export default router;