import { Request } from 'express';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../utils/password';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  generateRandomToken,
} from '../utils/jwt';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { recordAuditLog, checkFailedLoginPattern } from './auditService';
import { sendVerificationEmail, sendPasswordResetEmail } from './mailService';

interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export async function registerUser(input: RegisterInput) {
  const { firstName, lastName, password, confirmPassword } = input;

  // Normalise so "User@Example.com" and "user@example.com" can't both register.
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();

  if (password !== confirmPassword) throw ApiError.badRequest('Passwords do not match');

  const strengthError = validatePasswordStrength(password);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (existing) throw ApiError.conflict('An account with this email or username already exists');

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { firstName, lastName, email, username, passwordHash },
  });

  const verificationToken = generateRandomToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(verificationToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  // A misconfigured SMTP server must not roll the account back — the user
  // can always request a new link via the forgot-password / verify flow.
  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (err) {
    logger.error('Failed to send verification email', {
      userId: user.id,
      error: (err as Error).message,
    });
  }

  await recordAuditLog({ userId: user.id, action: 'REGISTER', status: 'SUCCESS' });

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    // Tells the frontend whether to say "verify then sign in" or "you can sign in now".
    verificationRequired: env.REQUIRE_EMAIL_VERIFICATION,
  };
}

export async function verifyEmail(rawToken: string) {
  if (!rawToken) throw ApiError.badRequest('Verification token is required');

  const tokenHash = hashToken(rawToken);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

  if (!record || record.used || record.expiresAt < new Date()) {
    throw ApiError.badRequest('Invalid or expired verification token');
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { isEmailVerified: true } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { used: true } }),
  ]);

  await recordAuditLog({ userId: record.userId, action: 'EMAIL_VERIFIED', status: 'SUCCESS' });
}

interface LoginInput {
  identifier: string; // email or username
  password: string;
  totpCode?: string;
  req: Request;
}

export async function loginUser({ identifier, password, totpCode, req }: LoginInput) {
  const normalised = identifier.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: normalised }, { username: normalised }] },
  });

  if (!user) {
    // Don't leak whether the account exists.
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (user.isBlocked) {
    await recordAuditLog({ userId: user.id, action: 'LOGIN_FAILED', status: 'FAILURE', req, metadata: { reason: 'blocked' } });
    throw ApiError.forbidden('This account has been blocked. Contact support.');
  }

  const validPassword = await verifyPassword(user.passwordHash, password);
  if (!validPassword) {
    await recordAuditLog({ userId: user.id, action: 'LOGIN_FAILED', status: 'FAILURE', req, metadata: { reason: 'bad_password' } });
    await checkFailedLoginPattern(user.id);
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (env.REQUIRE_EMAIL_VERIFICATION && !user.isEmailVerified) {
    await recordAuditLog({ userId: user.id, action: 'LOGIN_FAILED', status: 'FAILURE', req, metadata: { reason: 'email_unverified' } });
    throw ApiError.forbidden('Please verify your email address before signing in.');
  }

  if (user.totpEnabled) {
    if (!totpCode) {
      throw ApiError.badRequest('TOTP_REQUIRED');
    }
    const validTotp = authenticator.verify({ token: totpCode, secret: user.totpSecret ?? '' });
    if (!validTotp) {
      await recordAuditLog({ userId: user.id, action: 'LOGIN_FAILED', status: 'FAILURE', req, metadata: { reason: 'bad_totp' } });
      throw ApiError.unauthorized('Invalid authenticator code');
    }
  }

  const refreshToken = generateRefreshToken();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const accessToken = signAccessToken({ sub: user.id, role: user.role, sessionId: session.id });

  await recordAuditLog({ userId: user.id, action: 'LOGIN_SUCCESS', status: 'SUCCESS', req });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      totpEnabled: user.totpEnabled,
    },
  };
}

export async function refreshSession(rawRefreshToken: string, req: Request) {
  const tokenHash = hashToken(rawRefreshToken);
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: tokenHash },
    include: { user: true },
  });

  if (!session || session.isRevoked || session.expiresAt < new Date()) {
    throw ApiError.unauthorized('Session expired, please log in again');
  }
  if (session.user.isBlocked) {
    throw ApiError.forbidden('This account has been blocked');
  }

  // Rotate the refresh token: the old hash is overwritten, so a replayed
  // old token no longer matches any session.
  const newRefreshToken = generateRefreshToken();
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      userAgent: req.headers['user-agent'] ?? session.userAgent,
      ipAddress: req.ip ?? session.ipAddress,
    },
  });

  const accessToken = signAccessToken({ sub: session.userId, role: session.user.role, sessionId: session.id });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logoutUser(rawRefreshToken: string, userId?: string) {
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.session.updateMany({ where: { refreshTokenHash: tokenHash }, data: { isRevoked: true } });
  await recordAuditLog({ userId, action: 'LOGOUT', status: 'SUCCESS' });
}

export async function requestPasswordReset(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Always behave the same way whether or not the account exists.
  if (!user) return;

  const rawToken = generateRandomToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  try {
    await sendPasswordResetEmail(email, rawToken);
  } catch (err) {
    logger.error('Failed to send password reset email', { userId: user.id, error: (err as Error).message });
  }

  await recordAuditLog({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', status: 'SUCCESS' });
}

export async function resetPassword(rawToken: string, newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) throw ApiError.badRequest('Passwords do not match');
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.used || record.expiresAt < new Date()) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
    // Invalidate all existing sessions on password reset.
    prisma.session.updateMany({ where: { userId: record.userId }, data: { isRevoked: true } }),
  ]);

  await recordAuditLog({ userId: record.userId, action: 'PASSWORD_RESET_COMPLETED', status: 'SUCCESS' });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) throw ApiError.badRequest('Passwords do not match');
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await recordAuditLog({ userId, action: 'PASSWORD_CHANGED', status: 'SUCCESS' });
}

// ---------------- 2FA (TOTP) ----------------

export async function setupTotp(userId: string) {
  const secret = authenticator.generateSecret();
  const user = await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: secret, totpEnabled: false },
  });

  const otpauth = authenticator.keyuri(user.email, 'SecureCloudStorage', secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  return { secret, qrCodeDataUrl };
}

export async function confirmTotp(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpSecret) throw ApiError.badRequest('TOTP setup was not initiated');

  const valid = authenticator.verify({ token: code, secret: user.totpSecret });
  if (!valid) throw ApiError.badRequest('Invalid authenticator code');

  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  await recordAuditLog({ userId, action: 'TWO_FA_ENABLED', status: 'SUCCESS' });
}

export async function disableTotp(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) throw ApiError.badRequest('Incorrect password');

  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecret: null } });
  await recordAuditLog({ userId, action: 'TWO_FA_DISABLED', status: 'SUCCESS' });
}

export async function listActiveSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeSession(userId: string, sessionId: string) {
  await prisma.session.updateMany({ where: { id: sessionId, userId }, data: { isRevoked: true } });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    totpEnabled: user.totpEnabled,
  };
}
