import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.use(requireAuth());

// Admin-only: full user management and system control.
router.get('/users', requireRole('ADMIN'), asyncHandler(adminController.listUsers));
router.post('/users/:userId/block', requireRole('ADMIN'), asyncHandler(adminController.blockUser));
router.post('/users/:userId/unblock', requireRole('ADMIN'), asyncHandler(adminController.unblockUser));
router.delete('/users/:userId', requireRole('ADMIN'), asyncHandler(adminController.deleteUser));
router.get('/stats', requireRole('ADMIN'), asyncHandler(adminController.getStats));

// Admin-only: full audit log access.
router.get('/audit-logs', requireRole('ADMIN'), asyncHandler(adminController.listAuditLogs));

// Moderators AND admins can view security events (spec section 3) -
// moderators do not get access to users' decrypted files or admin user-management actions.
router.get('/security-events', requireRole('ADMIN', 'MODERATOR'), asyncHandler(adminController.listSecurityEvents));

export default router;
