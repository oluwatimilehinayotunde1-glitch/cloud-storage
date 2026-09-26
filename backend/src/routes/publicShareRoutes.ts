import { Router } from 'express';
import * as shareController from '../controllers/shareController';
import { asyncHandler } from '../middleware/asyncHandler';

// Public route (no auth) - protected only by the unguessable share token.
const router = Router();
router.get('/:token', asyncHandler(shareController.accessShare));

export default router;
