import { Response } from 'express';
import { VaultAuthenticatedRequest, VAULT_SESSION_COOKIE } from '../middleware/vaultAuth';
import { sendSuccess } from '../utils/apiResponse';
import { signVaultSessionToken } from '../utils/jwt';
import { env } from '../config/env';
import * as vaultService from '../services/vaultService';

/**
 * The vault-session cookie is scoped to /api/v1 (not just /vault)
 * because it must also be sent on GET /api/v1/files/:id/download,
 * which is where it's actually consumed - see fileService.downloadFile.
 */
function vaultCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    maxAge: 15 * 60 * 1000, // mirror VAULT_SESSION_EXPIRY's default; cookie TTL is just a client-side hint, the JWT's own exp is authoritative
    path: '/api/v1',
  };
}

function issueVaultSession(res: Response, userId: string, kek: Buffer, kekSource: 'vault' | 'recovery') {
  const token = signVaultSessionToken({ sub: userId, kek: kek.toString('base64'), kekSource });
  res.cookie(VAULT_SESSION_COOKIE, token, vaultCookieOptions());
}

export async function setupVaultHandler(req: VaultAuthenticatedRequest, res: Response) {
  const { vaultPassword, confirmVaultPassword } = req.body;
  const { recoveryCode } = await vaultService.setupVault(req.user!.id, vaultPassword, confirmVaultPassword);
  // Immediately unlock the vault for this session too, so the user can
  // go straight into "protect my existing files" without re-entering
  // the password they just set.
  const kek = await vaultService.verifyVaultPassword(req.user!.id, vaultPassword);
  issueVaultSession(res, req.user!.id, kek, 'vault');
  sendSuccess(
    res,
    { recoveryCode },
    'Vault Mode enabled. Save your recovery code now - it will not be shown again.',
    201
  );
}

export async function unlockVaultHandler(req: VaultAuthenticatedRequest, res: Response) {
  const kek = await vaultService.verifyVaultPassword(req.user!.id, req.body.vaultPassword);
  issueVaultSession(res, req.user!.id, kek, 'vault');
  sendSuccess(res, {}, 'Vault unlocked');
}

export async function unlockVaultWithRecoveryHandler(req: VaultAuthenticatedRequest, res: Response) {
  const kek = await vaultService.verifyRecoveryCode(req.user!.id, req.body.recoveryCode);
  issueVaultSession(res, req.user!.id, kek, 'recovery');
  sendSuccess(
    res,
    { mustResetVaultPassword: true },
    'Recovery code accepted. Please set a new vault password now.'
  );
}

export async function lockVaultHandler(req: VaultAuthenticatedRequest, res: Response) {
  res.clearCookie(VAULT_SESSION_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE, path: '/api/v1' });
  sendSuccess(res, {}, 'Vault locked');
}

export async function vaultStatusHandler(req: VaultAuthenticatedRequest, res: Response) {
  const status = await vaultService.getVaultStatus(req.user!.id);
  sendSuccess(res, { ...status, isUnlocked: Boolean(req.vault) });
}

export async function protectExistingFilesHandler(req: VaultAuthenticatedRequest, res: Response) {
  // requireVaultUnlocked() guarantees req.vault is set with the vault
  // KEK, but protecting a file also needs the RECOVERY kek so the
  // recovery code covers newly-protected files too - ask for it here
  // rather than storing it, same server-side-within-request-scope
  // trade-off as everything else in this module.
  const recoveryKek = await vaultService.verifyRecoveryCode(req.user!.id, req.body.recoveryCode);
  const result = await vaultService.protectExistingFiles(req.user!.id, req.vault!.kek, recoveryKek);
  sendSuccess(res, result, `${result.protectedCount} file(s) are now vault-protected`);
}

export async function resetVaultPasswordHandler(req: VaultAuthenticatedRequest, res: Response) {
  const { newVaultPassword, confirmVaultPassword } = req.body;
  const result = await vaultService.resetVaultPassword(req.user!.id, newVaultPassword, confirmVaultPassword);
  // Old vault session (if any) is now stale w.r.t. the new KEK - clear
  // it and require an explicit re-unlock with the new password.
  res.clearCookie(VAULT_SESSION_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE, path: '/api/v1' });
  sendSuccess(res, result, 'Vault password updated. Please unlock the vault again with your new password.');
}

export async function regenerateRecoveryCodeHandler(req: VaultAuthenticatedRequest, res: Response) {
  const { recoveryCode } = await vaultService.regenerateRecoveryCode(req.user!.id);
  sendSuccess(res, { recoveryCode }, 'New recovery code generated. Save it now - it will not be shown again.');
}
