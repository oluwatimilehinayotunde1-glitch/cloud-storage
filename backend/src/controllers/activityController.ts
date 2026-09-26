import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { sendSuccess } from '../utils/apiResponse';
import { prisma } from '../config/prisma';

/** Returns the current user's own recent activity (their audit log entries). */
export async function myActivity(req: AuthenticatedRequest, res: Response) {
  const logs = await prisma.auditLog.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  sendSuccess(res, { logs });
}

/** Dashboard overview: totals + recent files/shares for the logged-in user. */
export async function dashboardOverview(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;

  const [user, totalFiles, recentFiles, recentShares] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { storageUsedBytes: true, storageQuotaBytes: true } }),
    prisma.file.count({ where: { ownerId: userId, isDeleted: false } }),
    prisma.file.findMany({
      where: { ownerId: userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, originalFilename: true, sizeBytes: true, createdAt: true },
    }),
    prisma.fileShare.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { file: { select: { originalFilename: true } } },
    }),
  ]);

  sendSuccess(res, {
    storageUsedBytes: user.storageUsedBytes,
    storageQuotaBytes: user.storageQuotaBytes,
    totalFiles,
    recentFiles,
    recentShares,
  });
}
