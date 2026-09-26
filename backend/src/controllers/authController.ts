import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { env } from '../config/env';
import * as authService from '../services/authService';

const REFRESH_COOKIE = 'refreshToken';

/**
 * The cookie is scoped to /api/v1/auth so it is only ever sent to the
 * endpoints that need it (refresh / logout), not on every API call.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    maxAge: env.JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  };
}

export async function register(req: AuthenticatedRequest, res: Response) {
  const user = await authService.registerUser(req.body);
  const message = user.verificationRequired
    ? 'Registration successful. Please verify your email before signing in.'
    : 'Registration successful. You can sign in now.';
  sendSuccess(res, { user }, message, 201);
}

export async function verifyEmailHandler(req: AuthenticatedRequest, res: Response) {
  await authService.verifyEmail(req.body.token);
  sendSuccess(res, {}, 'Email verified successfully');
}

export async function login(req: AuthenticatedRequest, res: Response) {
  const { identifier, password, totpCode } = req.body;
  const result = await authService.loginUser({ identifier, password, totpCode, req });

  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
  sendSuccess(res, { accessToken: result.accessToken, user: result.user }, 'Login successful');
}

export async function refresh(req: AuthenticatedRequest, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  // Must be a real error response, not `success: true` with a 401 status,
  // or the frontend's silent-refresh check reads it as a valid session.
  if (!token) throw ApiError.unauthorized('No refresh token provided');

  const result = await authService.refreshSession(token, req);
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
  sendSuccess(res, { accessToken: result.accessToken }, 'Token refreshed');
}

export async function logout(req: AuthenticatedRequest, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await authService.logoutUser(token, req.user?.id);
  }
  // clearCookie must be given the same flags the cookie was set with.
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/v1/auth',
  });
  sendSuccess(res, {}, 'Logged out successfully');
}

export async function forgotPassword(req: AuthenticatedRequest, res: Response) {
  await authService.requestPasswordReset(req.body.email);
  sendSuccess(res, {}, 'If an account exists for that email, a reset link has been sent.');
}

export async function resetPasswordHandler(req: AuthenticatedRequest, res: Response) {
  const { token, newPassword, confirmPassword } = req.body;
  await authService.resetPassword(token, newPassword, confirmPassword);
  sendSuccess(res, {}, 'Password reset successfully');
}

export async function changePasswordHandler(req: AuthenticatedRequest, res: Response) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  await authService.changePassword(req.user!.id, currentPassword, newPassword, confirmPassword);
  sendSuccess(res, {}, 'Password changed successfully');
}

export async function setupTotpHandler(req: AuthenticatedRequest, res: Response) {
  const result = await authService.setupTotp(req.user!.id);
  sendSuccess(res, result, 'Scan this QR code with your authenticator app, then confirm with a code');
}

export async function confirmTotpHandler(req: AuthenticatedRequest, res: Response) {
  await authService.confirmTotp(req.user!.id, req.body.code);
  sendSuccess(res, {}, 'Two-factor authentication enabled');
}

export async function disableTotpHandler(req: AuthenticatedRequest, res: Response) {
  await authService.disableTotp(req.user!.id, req.body.password);
  sendSuccess(res, {}, 'Two-factor authentication disabled');
}

export async function listSessionsHandler(req: AuthenticatedRequest, res: Response) {
  const sessions = await authService.listActiveSessions(req.user!.id);
  sendSuccess(res, { sessions });
}

export async function revokeSessionHandler(req: AuthenticatedRequest, res: Response) {
  await authService.revokeSession(req.user!.id, req.params.sessionId);
  sendSuccess(res, {}, 'Session revoked');
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const user = await authService.getCurrentUser(req.user!.id);
  sendSuccess(res, { user });
}
