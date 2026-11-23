import { Router } from 'express';
import * as UploadsController from '../controllers/uploads.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.post('/product-image', UploadsController.productImage);

export default router;
