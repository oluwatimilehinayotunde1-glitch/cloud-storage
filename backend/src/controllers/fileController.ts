import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { VaultAuthenticatedRequest } from '../middleware/vaultAuth';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import * as fileService from '../services/fileService';

export async function uploadFiles(req: AuthenticatedRequest, res: Response) {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) throw ApiError.badRequest('No files were uploaded');

  const folderId = (req.body.folderId as string) || null;

  const results = [];
  for (const f of files) {
    const created = await fileService.uploadFile({
      ownerId: req.user!.id,
      folderId,
      originalFilename: f.originalname,
      mimeType: f.mimetype,
      buffer: f.buffer,
    });
    results.push(created);
  }

  sendSuccess(res, { files: results }, 'File(s) uploaded and encrypted successfully', 201);
}

export async function listFiles(req: AuthenticatedRequest, res: Response) {
  const folderId = req.query.folderId as string | undefined;
  const search = req.query.search as string | undefined;
  const resolvedFolderId = folderId === 'root' ? null : folderId;
  const files = await fileService.listFiles(req.user!.id, resolvedFolderId, search);
  sendSuccess(res, { files });
}

export async function downloadFileHandler(req: VaultAuthenticatedRequest, res: Response) {
  const { buffer, filename, mimeType } = await fileService.downloadFile(req.params.id, req.user!.id, req.vault);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
}

export async function updateFile(req: AuthenticatedRequest, res: Response) {
  const { name, folderId } = req.body;
  let updated;
  if (name !== undefined) {
    updated = await fileService.renameFile(req.params.id, req.user!.id, name);
  }
  if (folderId !== undefined) {
    updated = await fileService.moveFile(req.params.id, req.user!.id, folderId);
  }
  sendSuccess(res, { file: updated }, 'File updated');
}

export async function deleteFileHandler(req: AuthenticatedRequest, res: Response) {
  await fileService.softDeleteFile(req.params.id, req.user!.id);
  sendSuccess(res, {}, 'File moved to recycle bin');
}

export async function listRecycleBinHandler(req: AuthenticatedRequest, res: Response) {
  const files = await fileService.listRecycleBin(req.user!.id);
  sendSuccess(res, { files });
}

export async function restoreFileHandler(req: AuthenticatedRequest, res: Response) {
  await fileService.restoreFile(req.params.id, req.user!.id);
  sendSuccess(res, {}, 'File restored');
}

export async function permanentDeleteHandler(req: AuthenticatedRequest, res: Response) {
  await fileService.permanentlyDeleteFile(req.params.id, req.user!.id);
  sendSuccess(res, {}, 'File permanently deleted');
}
