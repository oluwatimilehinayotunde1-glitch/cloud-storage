import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { sendSuccess } from '../utils/apiResponse';
import * as adminService from '../services/adminService';

function paginationParams(req: AuthenticatedRequest) {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) ?? '20', 10)));
  return { page, pageSize };
}

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  const { page, pageSize } = paginationParams(req);
  const result = await adminService.listUsers(page, pageSize);
  sendSuccess(res, result);
}

export async function blockUser(req: AuthenticatedRequest, res: Response) {
  await adminService.blockUser(req.user!.id, req.params.userId);
  sendSuccess(res, {}, 'User blocked');
}

export async function unblockUser(req: AuthenticatedRequest, res: Response) {
  await adminService.unblockUser(req.user!.id, req.params.userId);
  sendSuccess(res, {}, 'User unblocked');
}

export async function deleteUser(req: AuthenticatedRequest, res: Response) {
  await adminService.deleteUser(req.user!.id, req.params.userId);
  sendSuccess(res, {}, 'User deleted');
}

export async function getStats(req: AuthenticatedRequest, res: Response) {
  const stats = await adminService.getSystemStats();
  sendSuccess(res, { stats });
}

export async function listAuditLogs(req: AuthenticatedRequest, res: Response) {
  const { page, pageSize } = paginationParams(req);
  const result = await adminService.listAuditLogs(page, pageSize, req.query.action as string | undefined);
  sendSuccess(res, result);
}

export async function listSecurityEvents(req: AuthenticatedRequest, res: Response) {
  const { page, pageSize } = paginationParams(req);
  const result = await adminService.listSecurityEvents(page, pageSize);
  sendSuccess(res, result);
}
