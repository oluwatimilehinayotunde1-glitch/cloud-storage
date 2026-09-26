import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
  sessionId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings (not JWTs) so that they can
 * be individually revoked server-side by looking up their hash in the
 * `sessions` table. Only the SHA-256 hash of the token is stored -
 * the raw token is never persisted, only returned to the client once.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Random, unguessable public share tokens (not sequential IDs). */
export function generateShareToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Vault session token: issued by POST /vault/unlock (or
 * /vault/unlock/recovery) once the submitted password/recovery code
 * has been verified. Carries the derived KEK forward for the life of
 * the session so the user isn't re-prompted on every download.
 *
 * This is signed (not just opaque) with its own secret (see
 * config/env.ts: VAULT_SESSION_SECRET) and delivered as a short-lived,
 * httpOnly, secure cookie - never exposed to page JavaScript. See
 * crypto/vaultCrypto.ts's header comment for the trade-off this
 * implies (the server derives/handles the KEK server-side).
 */
export interface VaultSessionPayload {
  sub: string; // user id
  kek: string; // base64-encoded KEK, valid only for this token's lifetime
  kekSource: 'vault' | 'recovery';
}

export function signVaultSessionToken(payload: VaultSessionPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.VAULT_SESSION_EXPIRY as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, env.VAULT_SESSION_SECRET, options);
}

export function verifyVaultSessionToken(token: string): VaultSessionPayload {
  return jwt.verify(token, env.VAULT_SESSION_SECRET) as VaultSessionPayload;
}
