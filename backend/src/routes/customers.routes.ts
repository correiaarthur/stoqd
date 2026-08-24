import { Router } from 'express';
import * as CustomerController from '../controllers/customers.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', CustomerController.getAll);
router.get('/:id/statement', CustomerController.getStatement);
router.post('/', CustomerController.create);
router.put('/:id', CustomerController.update);
router.delete('/:id', CustomerController.remove);

export default router;