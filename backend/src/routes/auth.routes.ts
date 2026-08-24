import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { loginLimiter, registerLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.post('/login', loginLimiter, AuthController.login);
router.post('/register', registerLimiter, AuthController.register);

export default router;
