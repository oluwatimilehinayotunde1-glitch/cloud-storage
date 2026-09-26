import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';
import { recordAuditLog } from './auditService';

export async function listUsers(page: number, pageSize: number) {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, firstName: true, lastName: true, email: true, username: true,
        role: true, isBlocked: true, isEmailVerified: true,
        storageUsedBytes: true, storageQuotaBytes: true, createdAt: true,
      },
    }),
    prisma.user.count(),
  ]);
  return { users, total, page, pageSize };
}

export async function blockUser(adminId: string, userId: string) {
  if (adminId === userId) throw ApiError.badRequest('You cannot block your own account');
  await prisma.user.update({ where: { id: userId }, data: { isBlocked: true } });
  // Revoke all active sessions for the blocked user immediately.
  await prisma.session.updateMany({ where: { userId }, data: { isRevoked: true } });
  await recordAuditLog({ userId: adminId, action: 'USER_BLOCKED', status: 'SUCCESS', metadata: { targetUserId: userId } });
}

export async function unblockUser(adminId: string, userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { isBlocked: false } });
  await recordAuditLog({ userId: adminId, action: 'USER_UNBLOCKED', status: 'SUCCESS', metadata: { targetUserId: userId } });
}

export async function deleteUser(adminId: string, userId: string) {
  if (adminId === userId) throw ApiError.badRequest('You cannot delete your own account');
  await prisma.user.delete({ where: { id: userId } });
  await recordAuditLog({ userId: adminId, action: 'ADMIN_ACTION', status: 'SUCCESS', metadata: { action: 'DELETE_USER', targetUserId: userId } });
}

export async function getSystemStats() {
  const [totalUsers, activeUsers, blockedUsers, totalFiles, storageAgg, failedLogins24h] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: false } }),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.file.count({ where: { isDeleted: false } }),
    prisma.user.aggregate({ _sum: { storageUsedBytes: true } }),
    prisma.auditLog.count({
      where: { action: 'LOGIN_FAILED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  return {
    totalUsers,
    activeUsers,
    blockedUsers,
    totalFiles,
    totalStorageUsedBytes: storageAgg._sum.storageUsedBytes ?? 0,
    failedLogins24h,
  };
}

export async function listAuditLogs(page: number, pageSize: number, action?: string) {
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: action ? { action } : undefined,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true, email: true } } },
    }),
    prisma.auditLog.count({ where: action ? { action } : undefined }),
  ]);
  return { logs, total, page, pageSize };
}

export async function listSecurityEvents(page: number, pageSize: number) {
  const [events, total] = await Promise.all([
    prisma.securityEvent.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true, email: true } } },
    }),
    prisma.securityEvent.count(),
  ]);
  return { events, total, page, pageSize };
}
