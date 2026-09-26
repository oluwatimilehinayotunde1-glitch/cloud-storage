import { Router } from 'express';
import * as fileController from '../controllers/fileController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.use(requireAuth());

router.get('/', asyncHandler(fileController.listRecycleBinHandler));
router.post('/:id/restore', asyncHandler(fileController.restoreFileHandler));
router.delete('/:id', asyncHandler(fileController.permanentDeleteHandler));

export default router;
