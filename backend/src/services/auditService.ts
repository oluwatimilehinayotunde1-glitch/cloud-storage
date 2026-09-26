import { Request } from 'express';
import { prisma } from '../config/prisma';

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'REGISTER'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'EMAIL_VERIFIED'
  | 'TWO_FA_ENABLED'
  | 'TWO_FA_DISABLED'
  | 'FILE_UPLOADED'
  | 'FILE_DOWNLOADED'
  | 'FILE_DELETED'
  | 'FILE_RESTORED'
  | 'FILE_PERMANENTLY_DELETED'
  | 'FILE_RENAMED'
  | 'FILE_MOVED'
  | 'FILE_SHARED'
  | 'FILE_SHARE_REVOKED'
  | 'FOLDER_CREATED'
  | 'FOLDER_DELETED'
  | 'VAULT_ENABLED'
  | 'VAULT_UNLOCKED'
  | 'VAULT_UNLOCK_FAILED'
  | 'VAULT_RECOVERY_USED'
  | 'VAULT_RECOVERY_REGENERATED'
  | 'VAULT_PASSWORD_RESET'
  | 'FILE_VAULT_PROTECTED'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'SECURITY_SETTING_CHANGED'
  | 'ADMIN_ACTION';

interface AuditParams {
  userId?: string | null;
  action: AuditAction;
  status: 'SUCCESS' | 'FAILURE';
  req?: Request;
  metadata?: Record<string, unknown>;
}

/** Never pass passwords, raw keys, or tokens into `metadata`. */
export async function recordAuditLog({ userId, action, status, req, metadata }: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      status,
      ipAddress: req?.ip,
      userAgent: req?.headers['user-agent'] ?? undefined,
      metadata: metadata as any,
    },
  });
}

export async function recordSecurityEvent(params: {
  userId?: string | null;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}): Promise<void> {
  await prisma.securityEvent.create({
    data: {
      userId: params.userId ?? null,
      eventType: params.eventType,
      severity: params.severity,
      description: params.description,
    },
  });
}

/**
 * Simple rule-based security checks (Section 33 of the spec).
 * Called after a failed login to flag brute-force-style behaviour.
 * This is intentionally simple - a real anomaly-detection/AI module
 * can be layered on top later without changing this interface.
 */
export async function checkFailedLoginPattern(userId: string): Promise<void> {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const recentFailures = await prisma.auditLog.count({
    where: { userId, action: 'LOGIN_FAILED', status: 'FAILURE', createdAt: { gte: since } },
  });

  if (recentFailures >= 5) {
    await recordSecurityEvent({
      userId,
      eventType: 'MULTIPLE_FAILED_LOGINS',
      severity: 'HIGH',
      description: `${recentFailures} failed login attempts in the last 15 minutes`,
    });
  }
}
