import { Router } from 'express';
import * as shareController from '../controllers/shareController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

// Authenticated: manage my own shares
router.get('/', requireAuth(), asyncHandler(shareController.listMyShares));
router.delete('/:shareId', requireAuth(), asyncHandler(shareController.revokeShare));

export default router;
