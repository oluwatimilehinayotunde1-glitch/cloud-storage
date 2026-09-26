import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { verifyVaultSessionToken, VaultSessionPayload } from '../utils/jwt';
import { ApiError } from '../utils/apiError';

export const VAULT_SESSION_COOKIE = 'vaultSession';

export interface VaultAuthenticatedRequest extends AuthenticatedRequest {
  vault?: {
    kek: Buffer;
    kekSource: VaultSessionPayload['kekSource'];
  };
}

/**
 * Reads the vault-session cookie, if present and valid, and attaches
 * the decoded KEK to the request. Never throws - use this on routes
 * where vault protection is optional and per-resource (e.g. the file
 * download route checks file.vaultProtected itself, at the service
 * layer, rather than needing this middleware to fail the whole route).
 */
export function attachVaultSessionIfPresent() {
  return (req: VaultAuthenticatedRequest, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[VAULT_SESSION_COOKIE];
    if (!token) return next();
    try {
      const payload = verifyVaultSessionToken(token);
      if (payload.sub === req.user?.id) {
        req.vault = { kek: Buffer.from(payload.kek, 'base64'), kekSource: payload.kekSource };
      }
    } catch {
      // Expired/invalid/tampered vault session: treat exactly like "no
      // session" here. downloadFile() enforces the actual requirement
      // and returns the right VAULT_* error code.
    }
    next();
  };
}

/**
 * Hard-fails a route unless a valid, unexpired vault session belonging
 * to the authenticated user is present. Use this on routes that ALWAYS
 * require the vault to be unlocked (e.g. /vault/protect-existing),
 * as opposed to file download, which only requires it conditionally
 * per-file (enforced in fileService.downloadFile itself, at the
 * service layer, not just here - see section 5 of the design doc: a
 * curl/Postman request must be rejected too, not just the UI button).
 */
export function requireVaultUnlocked() {
  return (req: VaultAuthenticatedRequest, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[VAULT_SESSION_COOKIE];
    if (!token) {
      return next(ApiError.forbidden('Vault is locked. Unlock it with your vault password first.', 'VAULT_LOCKED'));
    }
    try {
      const payload = verifyVaultSessionToken(token);
      if (payload.sub !== req.user?.id) {
        return next(ApiError.forbidden('Vault unlock does not match the signed-in user.', 'VAULT_UNLOCK_INVALID'));
      }
      req.vault = { kek: Buffer.from(payload.kek, 'base64'), kekSource: payload.kekSource };
      next();
    } catch {
      next(ApiError.forbidden('Your vault session has expired. Please unlock it again.', 'VAULT_UNLOCK_EXPIRED'));
    }
  };
}
