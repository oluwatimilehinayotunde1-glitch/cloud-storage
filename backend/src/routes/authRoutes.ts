import { Router } from 'express';
import * as authController from '../controllers/authController';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../utils/validationSchemas';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), asyncHandler(authController.register));
router.post('/verify-email', asyncHandler(authController.verifyEmailHandler));
router.post('/login', authRateLimiter, validate(loginSchema), asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', requireAuth(), asyncHandler(authController.logout));
router.post('/forgot-password', authRateLimiter, validate(forgotPasswordSchema), asyncHandler(authController.forgotPassword));
router.post('/reset-password', authRateLimiter, validate(resetPasswordSchema), asyncHandler(authController.resetPasswordHandler));

// Security settings (require auth)
router.post('/change-password', requireAuth(), validate(changePasswordSchema), asyncHandler(authController.changePasswordHandler));
router.post('/2fa/setup', requireAuth(), asyncHandler(authController.setupTotpHandler));
router.post('/2fa/confirm', requireAuth(), asyncHandler(authController.confirmTotpHandler));
router.post('/2fa/disable', requireAuth(), asyncHandler(authController.disableTotpHandler));
router.get('/sessions', requireAuth(), asyncHandler(authController.listSessionsHandler));
router.delete('/sessions/:sessionId', requireAuth(), asyncHandler(authController.revokeSessionHandler));
router.get('/me', requireAuth(), asyncHandler(authController.me));

export default router;
