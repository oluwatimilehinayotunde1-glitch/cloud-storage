import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';
import { validatePasswordStrength } from '../utils/password';
import { getRsaPrivateKey } from '../crypto/keyManager';
import { unwrapAesKey } from '../crypto/hybridCrypto';
import {
  generateVaultSalt,
  deriveMasterSecret,
  deriveKek,
  computeVerifierHash,
  verifierHashesMatch,
  generateRecoveryCode,
  wrapAesKeyWithKek,
} from '../crypto/vaultCrypto';
import { recordAuditLog } from './auditService';

/**
 * Set up Vault Mode for a user who does not have it enabled yet.
 * Returns the recovery code EXACTLY ONCE - it is never stored or
 * retrievable again after this call returns.
 */
export async function setupVault(userId: string, vaultPassword: string, confirmVaultPassword: string) {
  if (vaultPassword !== confirmVaultPassword) throw ApiError.badRequest('Vault passwords do not match');
  const strengthError = validatePasswordStrength(vaultPassword);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.vaultEnabled) {
    throw ApiError.conflict('Vault Mode is already enabled. Use "change vault password" instead.');
  }

  const vaultSalt = generateVaultSalt();
  const masterSecret = await deriveMasterSecret(vaultPassword, vaultSalt);
  const vaultVerifierHash = computeVerifierHash(masterSecret);

  const recoveryCode = generateRecoveryCode();
  const recoverySalt = generateVaultSalt();
  const recoveryMasterSecret = await deriveMasterSecret(recoveryCode, recoverySalt);
  const recoveryVerifierHash = computeVerifierHash(recoveryMasterSecret);

  await prisma.user.update({
    where: { id: userId },
    data: {
      vaultEnabled: true,
      vaultSalt: vaultSalt.toString('base64'),
      vaultVerifierHash,
      vaultKeyVersion: 1,
      recoverySalt: recoverySalt.toString('base64'),
      recoveryVerifierHash,
    },
  });

  await recordAuditLog({ userId, action: 'VAULT_ENABLED', status: 'SUCCESS' });

  // Caller (controller) is responsible for making sure this value is
  // shown to the user exactly once and never logged.
  return { recoveryCode };
}

/**
 * Verify a submitted vault password and, if correct, return the KEK
 * to embed in a signed vault-session token. Does not touch any files.
 */
export async function verifyVaultPassword(userId: string, vaultPassword: string): Promise<Buffer> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.vaultEnabled || !user.vaultSalt || !user.vaultVerifierHash) {
    throw ApiError.badRequest('Vault Mode is not enabled for this account');
  }

  const salt = Buffer.from(user.vaultSalt, 'base64');
  const masterSecret = await deriveMasterSecret(vaultPassword, salt);
  const candidateHash = computeVerifierHash(masterSecret);

  if (!verifierHashesMatch(candidateHash, user.vaultVerifierHash)) {
    await recordAuditLog({ userId, action: 'VAULT_UNLOCK_FAILED', status: 'FAILURE' });
    throw ApiError.unauthorized('Incorrect vault password');
  }

  await recordAuditLog({ userId, action: 'VAULT_UNLOCKED', status: 'SUCCESS' });
  return deriveKek(masterSecret);
}

/**
 * Verify a submitted recovery code and, if correct, return its KEK.
 * A successful recovery unlock should prompt the caller (controller/
 * frontend) to force a vault-password reset afterward.
 */
export async function verifyRecoveryCode(userId: string, recoveryCode: string): Promise<Buffer> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.vaultEnabled || !user.recoverySalt || !user.recoveryVerifierHash) {
    throw ApiError.badRequest('Vault Mode is not enabled for this account');
  }

  const salt = Buffer.from(user.recoverySalt, 'base64');
  const masterSecret = await deriveMasterSecret(recoveryCode.trim().toUpperCase(), salt);
  const candidateHash = computeVerifierHash(masterSecret);

  if (!verifierHashesMatch(candidateHash, user.recoveryVerifierHash)) {
    await recordAuditLog({ userId, action: 'VAULT_UNLOCK_FAILED', status: 'FAILURE', metadata: { via: 'recovery' } });
    throw ApiError.unauthorized('Incorrect recovery code');
  }

  await recordAuditLog({ userId, action: 'VAULT_RECOVERY_USED', status: 'SUCCESS' });
  return deriveKek(masterSecret);
}

/** Vault status for the Settings page - never returns any secret material. */
export async function getVaultStatus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const protectedCount = await prisma.file.count({ where: { ownerId: userId, isDeleted: false, vaultProtected: true } });
  const unprotectedCount = await prisma.file.count({ where: { ownerId: userId, isDeleted: false, vaultProtected: false } });
  return {
    vaultEnabled: user.vaultEnabled,
    vaultKeyVersion: user.vaultKeyVersion,
    protectedFileCount: protectedCount,
    unprotectedFileCount: unprotectedCount,
  };
}

/**
 * Re-wrap a single file's AES key under a new vault KEK and/or recovery
 * KEK. The AES key itself is recovered via the RSA path (the system
 * key, which every file is always wrapped under - see hybridCrypto.ts),
 * NOT via the old vault/recovery KEK - this is what lets us rotate the
 * vault password or recovery code without needing the OLD secret.
 */
async function rewrapFileKey(
  fileId: string,
  opts: { vaultKek?: Buffer; recoveryKek?: Buffer; vaultKeyVersion?: number }
) {
  const metadata = await prisma.encryptionMetadata.findUnique({ where: { fileId } });
  if (!metadata) return;

  const aesKey = unwrapAesKey(metadata.encryptedAesKey, getRsaPrivateKey());

  const data: Record<string, unknown> = {};
  if (opts.vaultKek) {
    const wrapped = wrapAesKeyWithKek(aesKey, opts.vaultKek);
    data.vaultWrappedAesKey = wrapped.wrappedKeyB64;
    data.vaultWrapIv = wrapped.ivB64;
    data.vaultWrapAuthTag = wrapped.authTagB64;
    data.vaultKeyVersion = opts.vaultKeyVersion ?? null;
  }
  if (opts.recoveryKek) {
    const wrapped = wrapAesKeyWithKek(aesKey, opts.recoveryKek);
    data.recoveryWrappedAesKey = wrapped.wrappedKeyB64;
    data.recoveryWrapIv = wrapped.ivB64;
    data.recoveryWrapAuthTag = wrapped.authTagB64;
  }

  aesKey.fill(0);

  if (Object.keys(data).length > 0) {
    await prisma.encryptionMetadata.update({ where: { fileId }, data });
  }
}

/**
 * One-time batch job (triggered by the user from Settings): wrap every
 * existing, not-yet-vault-protected file's AES key under the vault KEK
 * (and the recovery KEK), and mark it vaultProtected. Requires the
 * vault to be unlocked (the KEK to wrap with) - it does NOT require
 * the recovery KEK, since re-wrapping goes through the RSA path, but
 * we protect under recovery too so the recovery code covers this file.
 */
export async function protectExistingFiles(userId: string, vaultKek: Buffer, recoveryKek: Buffer) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.vaultEnabled) throw ApiError.badRequest('Vault Mode is not enabled for this account');

  const files = await prisma.file.findMany({
    where: { ownerId: userId, isDeleted: false, vaultProtected: false },
    select: { id: true },
  });

  for (const file of files) {
    await rewrapFileKey(file.id, { vaultKek, recoveryKek, vaultKeyVersion: user.vaultKeyVersion });
    await prisma.file.update({ where: { id: file.id }, data: { vaultProtected: true } });
    await recordAuditLog({ userId, action: 'FILE_VAULT_PROTECTED', status: 'SUCCESS', metadata: { fileId: file.id } });
  }

  return { protectedCount: files.length };
}

/**
 * Set a new vault password (used both for a deliberate "change vault
 * password" action and after a successful recovery-code unlock). Every
 * already vault-protected file is re-wrapped under the new KEK via the
 * RSA path, so the OLD vault password is never required to do this.
 */
export async function resetVaultPassword(userId: string, newVaultPassword: string, confirmVaultPassword: string) {
  if (newVaultPassword !== confirmVaultPassword) throw ApiError.badRequest('Vault passwords do not match');
  const strengthError = validatePasswordStrength(newVaultPassword);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.vaultEnabled) throw ApiError.badRequest('Vault Mode is not enabled for this account');

  const newSalt = generateVaultSalt();
  const masterSecret = await deriveMasterSecret(newVaultPassword, newSalt);
  const newVerifierHash = computeVerifierHash(masterSecret);
  const newKek = deriveKek(masterSecret);
  const newKeyVersion = user.vaultKeyVersion + 1;

  const protectedFiles = await prisma.file.findMany({
    where: { ownerId: userId, isDeleted: false, vaultProtected: true },
    select: { id: true },
  });

  for (const file of protectedFiles) {
    await rewrapFileKey(file.id, { vaultKek: newKek, vaultKeyVersion: newKeyVersion });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      vaultSalt: newSalt.toString('base64'),
      vaultVerifierHash: newVerifierHash,
      vaultKeyVersion: newKeyVersion,
    },
  });

  await recordAuditLog({ userId, action: 'VAULT_PASSWORD_RESET', status: 'SUCCESS' });
  return { rewrappedFileCount: protectedFiles.length };
}

/**
 * Invalidate the old recovery code and issue a new one. Every
 * vault-protected file's recovery-wrapped key is re-wrapped via the
 * RSA path, so the OLD recovery code is never required.
 */
export async function regenerateRecoveryCode(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.vaultEnabled) throw ApiError.badRequest('Vault Mode is not enabled for this account');

  const recoveryCode = generateRecoveryCode();
  const recoverySalt = generateVaultSalt();
  const recoveryMasterSecret = await deriveMasterSecret(recoveryCode, recoverySalt);
  const recoveryVerifierHash = computeVerifierHash(recoveryMasterSecret);
  const recoveryKek = deriveKek(recoveryMasterSecret);

  const protectedFiles = await prisma.file.findMany({
    where: { ownerId: userId, isDeleted: false, vaultProtected: true },
    select: { id: true },
  });

  for (const file of protectedFiles) {
    await rewrapFileKey(file.id, { recoveryKek });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { recoverySalt: recoverySalt.toString('base64'), recoveryVerifierHash },
  });

  await recordAuditLog({ userId, action: 'VAULT_RECOVERY_REGENERATED', status: 'SUCCESS' });
  return { recoveryCode };
}
