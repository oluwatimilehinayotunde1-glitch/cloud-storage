import { Router } from 'express';
import * as activityController from '../controllers/activityController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.use(requireAuth());

router.get('/', asyncHandler(activityController.myActivity));
router.get('/dashboard', asyncHandler(activityController.dashboardOverview));

export default router;
