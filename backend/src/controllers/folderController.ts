import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { VaultAuthenticatedRequest } from '../middleware/vaultAuth';
import { sendSuccess } from '../utils/apiResponse';
import * as folderService from '../services/folderService';

export async function createFolder(req: AuthenticatedRequest, res: Response) {
  const { name, parentId } = req.body;
  const folder = await folderService.createFolder(req.user!.id, name, parentId ?? null);
  sendSuccess(res, { folder }, 'Folder created', 201);
}

export async function listFolders(req: AuthenticatedRequest, res: Response) {
  const parentId = req.query.parentId as string | undefined;
  const resolved = parentId === 'root' ? null : parentId;
  const folders = await folderService.listFolders(req.user!.id, resolved);
  sendSuccess(res, { folders });
}

export async function updateFolder(req: AuthenticatedRequest, res: Response) {
  const folder = await folderService.renameFolder(req.user!.id, req.params.id, req.body.name);
  sendSuccess(res, { folder }, 'Folder renamed');
}

export async function deleteFolder(req: AuthenticatedRequest, res: Response) {
  await folderService.deleteFolder(req.user!.id, req.params.id);
  sendSuccess(res, {}, 'Folder deleted');
}

/**
 * Streams a ZIP of everything under the folder. Vault-protected files
 * are only included if a valid vault session is attached (see
 * middleware/vaultAuth.ts's attachVaultSessionIfPresent, wired on
 * folderRoutes the same way as fileRoutes) - otherwise they're
 * skipped, and the response header reports how many were skipped so
 * the frontend can tell the user rather than silently under-delivering.
 */
export async function downloadFolder(req: VaultAuthenticatedRequest, res: Response) {
  const { buffer, filename, skippedVaultProtected } = await folderService.downloadFolderAsZip(
    req.user!.id,
    req.params.id,
    req.vault
  );
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('X-Vault-Skipped-Count', String(skippedVaultProtected));
  res.send(buffer);
}

