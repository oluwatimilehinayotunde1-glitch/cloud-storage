import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/** General API rate limit. */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.', data: {} },
});

/**
 * Stricter limiter for auth endpoints, to slow down brute-force /
 * credential-stuffing attempts.
 *
 * This budget is shared by register, login, forgot-password and
 * reset-password, so it is deliberately loose outside production —
 * a 10-request ceiling locks you out halfway through testing the
 * sign-up flow.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many authentication attempts, please try again later.', data: {} },
});

/**
 * Vault unlock/recovery is a password-guessing surface just like login,
 * and is rate-limited the same way (loose outside production so the
 * setup/unlock flow can be tested repeatedly during development).
 */
export const vaultUnlockRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.VAULT_UNLOCK_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many vault unlock attempts, please try again later.', data: {} },
});
