import { Router } from 'express';
import * as AnalyticsController from '../controllers/analytics.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/summary', AnalyticsController.getDashboardSummary);
router.get('/sales-report', AnalyticsController.getSalesReport);

export default router;
