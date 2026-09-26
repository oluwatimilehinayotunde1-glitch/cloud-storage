import { Router } from 'express';
import * as folderController from '../controllers/folderController';
import * as shareController from '../controllers/shareController';
import { requireAuth } from '../middleware/auth';
import { attachVaultSessionIfPresent } from '../middleware/vaultAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validate';
import { createFolderSchema, shareFileSchema } from '../utils/validationSchemas';

const router = Router();
router.use(requireAuth());
router.use(attachVaultSessionIfPresent());

router.get('/', asyncHandler(folderController.listFolders));
router.post('/', validate(createFolderSchema), asyncHandler(folderController.createFolder));
router.patch('/:id', asyncHandler(folderController.updateFolder));
router.delete('/:id', asyncHandler(folderController.deleteFolder));
router.get('/:id/download', asyncHandler(folderController.downloadFolder));
router.post('/:id/share', validate(shareFileSchema), asyncHandler(shareController.createFolderShare));

export default router;
