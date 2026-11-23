import { Router } from 'express';
import * as SettingsController from '../controllers/settings.controller.js';
import { authMiddleware, requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/installments', SettingsController.getInstallmentPlans);
router.put('/installments', SettingsController.updateInstallmentPlans);

export default router;
