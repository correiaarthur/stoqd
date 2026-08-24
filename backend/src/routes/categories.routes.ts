import { Router } from 'express';
import { getAll, create, update, remove } from '../controllers/categories.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.get('/', getAll); 

router.post('/', authMiddleware, requireAdmin, create);
router.put('/:id', authMiddleware, requireAdmin, update);
router.delete('/:id', authMiddleware, requireAdmin, remove);

export default router;