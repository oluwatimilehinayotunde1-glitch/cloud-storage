import { Response, Request } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { sendSuccess } from '../utils/apiResponse';
import * as shareService from '../services/shareService';
import { env } from '../config/env';

export async function createShare(req: AuthenticatedRequest, res: Response) {
  const { expiresInHours, maxDownloads, downloadPolicy } = req.body;
  const share = await shareService.createShare({
    fileId: req.params.id,
    userId: req.user!.id,
    expiresInHours,
    maxDownloads,
    downloadPolicy,
  });
  sendSuccess(res, { share, url: `${env.FRONTEND_URL}/share/${share.token}` }, 'Share link created', 201);
}

export async function createFolderShare(req: AuthenticatedRequest, res: Response) {
  const { expiresInHours, maxDownloads, downloadPolicy } = req.body;
  const share = await shareService.createShare({
    folderId: req.params.id,
    userId: req.user!.id,
    expiresInHours,
    maxDownloads,
    downloadPolicy,
  });
  sendSuccess(res, { share, url: `${env.FRONTEND_URL}/share/${share.token}` }, 'Share link created', 201);
}

export async function listMyShares(req: AuthenticatedRequest, res: Response) {
  const shares = await shareService.listMyShares(req.user!.id);
  sendSuccess(res, { shares });
}

export async function revokeShare(req: AuthenticatedRequest, res: Response) {
  await shareService.revokeShare(req.user!.id, req.params.shareId);
  sendSuccess(res, {}, 'Share link revoked');
}

/** Public endpoint - no auth required, protected only by the unguessable token. */
export async function accessShare(req: Request, res: Response) {
  const { buffer, filename, mimeType } = await shareService.accessSharedResource(req.params.token);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
}
