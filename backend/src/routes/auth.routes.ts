import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { loginLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.post('/login', loginLimiter, AuthController.login);

export default router;