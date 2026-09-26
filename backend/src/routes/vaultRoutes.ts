import { Router } from 'express';
import * as vaultController from '../controllers/vaultController';
import { requireAuth } from '../middleware/auth';
import { attachVaultSessionIfPresent, requireVaultUnlocked } from '../middleware/vaultAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { vaultUnlockRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  vaultSetupSchema,
  vaultUnlockSchema,
  vaultRecoveryUnlockSchema,
  vaultResetPasswordSchema,
} from '../utils/validationSchemas';

const router = Router();
router.use(requireAuth());
router.use(attachVaultSessionIfPresent());

router.get('/status', asyncHandler(vaultController.vaultStatusHandler));
router.post('/setup', vaultUnlockRateLimiter, validate(vaultSetupSchema), asyncHandler(vaultController.setupVaultHandler));
router.post('/unlock', vaultUnlockRateLimiter, validate(vaultUnlockSchema), asyncHandler(vaultController.unlockVaultHandler));
router.post(
  '/unlock/recovery',
  vaultUnlockRateLimiter,
  validate(vaultRecoveryUnlockSchema),
  asyncHandler(vaultController.unlockVaultWithRecoveryHandler)
);
router.post('/lock', asyncHandler(vaultController.lockVaultHandler));
router.post(
  '/protect-existing',
  requireVaultUnlocked(),
  validate(vaultRecoveryUnlockSchema),
  asyncHandler(vaultController.protectExistingFilesHandler)
);
router.post(
  '/reset-password',
  requireVaultUnlocked(),
  validate(vaultResetPasswordSchema),
  asyncHandler(vaultController.resetVaultPasswordHandler)
);
router.post('/recovery/regenerate', requireVaultUnlocked(), asyncHandler(vaultController.regenerateRecoveryCodeHandler));

export default router;
