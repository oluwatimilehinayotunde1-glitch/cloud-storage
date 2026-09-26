import { Router } from 'express';
import * as fileController from '../controllers/fileController';
import * as shareController from '../controllers/shareController';
import { requireAuth } from '../middleware/auth';
import { attachVaultSessionIfPresent } from '../middleware/vaultAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { upload } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { shareFileSchema } from '../utils/validationSchemas';

const router = Router();
router.use(requireAuth());
router.use(attachVaultSessionIfPresent());

router.get('/', asyncHandler(fileController.listFiles));
router.post('/upload', upload.array('files', 10), asyncHandler(fileController.uploadFiles));
router.get('/:id/download', asyncHandler(fileController.downloadFileHandler));
router.patch('/:id', asyncHandler(fileController.updateFile));
router.delete('/:id', asyncHandler(fileController.deleteFileHandler));

router.post('/:id/share', validate(shareFileSchema), asyncHandler(shareController.createShare));

export default router;
