import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';
import { getStorageAdapter } from './storageAdapter';
import { hybridEncryptFile, hybridDecryptFile, decryptFileBuffer } from '../crypto/hybridCrypto';
import { getRsaPublicKey, getRsaPrivateKey, getRsaKeyId } from '../crypto/keyManager';
import { unwrapAesKeyWithKek } from '../crypto/vaultCrypto';
import { sanitizeFilename } from '../middleware/upload';
import { recordAuditLog } from './auditService';

/**
 * Upload pipeline (spec section 9):
 *   validate -> generate AES key -> encrypt -> wrap key with RSA ->
 *   upload encrypted bytes to storage -> persist metadata in Postgres
 */
export async function uploadFile(params: {
  ownerId: string;
  folderId: string | null;
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const { ownerId, folderId, originalFilename, mimeType, buffer } = params;

  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, ownerId, isDeleted: false } });
    if (!folder) throw ApiError.badRequest('Target folder does not exist');
  }

  // Enforce per-user storage quota.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
  if (BigInt(user.storageUsedBytes) + BigInt(buffer.length) > BigInt(user.storageQuotaBytes)) {
    throw ApiError.badRequest('Storage quota exceeded');
  }

  const safeName = sanitizeFilename(originalFilename);
  const objectKey = `users/${ownerId}/${crypto.randomUUID()}-${safeName}.enc`;

  const encrypted = hybridEncryptFile(buffer, getRsaPublicKey(), getRsaKeyId());

  const storage = getStorageAdapter();
  await storage.putObject(objectKey, encrypted.ciphertext, 'application/octet-stream');

  const file = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.file.create({
      data: {
        ownerId,
        folderId,
        originalFilename: safeName,
        storedObjectKey: objectKey,
        mimeType,
        sizeBytes: buffer.length,
        sha256Hash: encrypted.sha256,
        isEncrypted: true,
        encryptionAlgorithm: 'AES_256_GCM',
        encryptionMetadata: {
          create: {
            encryptedAesKey: encrypted.encryptedAesKeyB64,
            iv: encrypted.ivB64,
            authTag: encrypted.authTagB64,
            rsaKeyId: encrypted.rsaKeyId,
          },
        },
      },
      include: { encryptionMetadata: true },
    });

    await tx.user.update({
      where: { id: ownerId },
      data: { storageUsedBytes: { increment: buffer.length } },
    });

    return created;
  });

  await recordAuditLog({
    userId: ownerId,
    action: 'FILE_UPLOADED',
    status: 'SUCCESS',
    metadata: { fileId: file.id, filename: safeName, sizeBytes: buffer.length },
  });

  return file;
}

async function getOwnedFileOrThrow(fileId: string, userId: string) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, ownerId: userId, isDeleted: false },
    include: { encryptionMetadata: true },
  });
  if (!file) throw ApiError.notFound('File not found');
  return file;
}

/**
 * Download pipeline (spec section 10): checks ownership, retrieves
 * ciphertext + wrapped key, unwraps + decrypts, verifies integrity.
 *
 * If the file is vault-protected, a valid vault session (see
 * middleware/vaultAuth.ts) is REQUIRED here, at the service layer -
 * not just checked in the route/UI. This is deliberate: a curl/Postman
 * request that skips the frontend's lock icon must be rejected too,
 * or the vault password would be a UI-only decoration rather than a
 * real second factor in decryption.
 */
export async function downloadFile(
  fileId: string,
  userId: string,
  vault?: { kek: Buffer; kekSource: 'vault' | 'recovery' }
) {
  const file = await getOwnedFileOrThrow(fileId, userId);
  if (!file.encryptionMetadata) throw ApiError.internal('File is missing encryption metadata');

  if (file.vaultProtected) {
    if (!vault) {
      throw ApiError.forbidden('This file is vault-protected. Unlock the vault to download it.', 'VAULT_LOCKED');
    }

    const meta = file.encryptionMetadata;
    const wrappedField = vault.kekSource === 'vault' ? meta.vaultWrappedAesKey : meta.recoveryWrappedAesKey;
    const ivField = vault.kekSource === 'vault' ? meta.vaultWrapIv : meta.recoveryWrapIv;
    const authTagField = vault.kekSource === 'vault' ? meta.vaultWrapAuthTag : meta.recoveryWrapAuthTag;

    if (!wrappedField || !ivField || !authTagField) {
      throw ApiError.internal('File is marked vault-protected but is missing vault key-wrap metadata');
    }

    const storage = getStorageAdapter();
    const ciphertext = await storage.getObject(file.storedObjectKey);

    let aesKey: Buffer;
    try {
      aesKey = unwrapAesKeyWithKek(
        { wrappedKeyB64: wrappedField, ivB64: ivField, authTagB64: authTagField },
        vault.kek
      );
    } catch {
      // Wrong/stale KEK (e.g. a vault session issued before a password
      // reset). Do NOT silently fall back to the RSA-only path - that
      // would defeat the whole point of the second wrap.
      throw ApiError.forbidden('Your vault session is no longer valid for this file. Please unlock the vault again.', 'VAULT_UNLOCK_INVALID');
    }

    const plaintext = decryptFileBuffer(ciphertext, aesKey, Buffer.from(meta.iv, 'base64'), Buffer.from(meta.authTag, 'base64'));
    aesKey.fill(0);

    await recordAuditLog({ userId, action: 'FILE_DOWNLOADED', status: 'SUCCESS', metadata: { fileId, vaultProtected: true } });
    return { buffer: plaintext, filename: file.originalFilename, mimeType: file.mimeType };
  }

  const storage = getStorageAdapter();
  const ciphertext = await storage.getObject(file.storedObjectKey);

  const plaintext = hybridDecryptFile(
    ciphertext,
    file.encryptionMetadata.iv,
    file.encryptionMetadata.authTag,
    file.encryptionMetadata.encryptedAesKey,
    getRsaPrivateKey(),
    file.sha256Hash
  );

  await recordAuditLog({ userId, action: 'FILE_DOWNLOADED', status: 'SUCCESS', metadata: { fileId } });

  return { buffer: plaintext, filename: file.originalFilename, mimeType: file.mimeType };
}

export async function listFiles(userId: string, folderId: string | null | undefined, search?: string) {
  return prisma.file.findMany({
    where: {
      ownerId: userId,
      isDeleted: false,
      folderId: folderId === undefined ? undefined : folderId,
      ...(search
        ? { originalFilename: { contains: search, mode: 'insensitive' as const } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
      isEncrypted: true,
      encryptionAlgorithm: true,
      vaultProtected: true,
    },
  });
}

export async function renameFile(fileId: string, userId: string, newName: string) {
  await getOwnedFileOrThrow(fileId, userId);
  const safeName = sanitizeFilename(newName);
  const updated = await prisma.file.update({ where: { id: fileId }, data: { originalFilename: safeName } });
  await recordAuditLog({ userId, action: 'FILE_RENAMED', status: 'SUCCESS', metadata: { fileId, newName: safeName } });
  return updated;
}

export async function moveFile(fileId: string, userId: string, folderId: string | null) {
  await getOwnedFileOrThrow(fileId, userId);
  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, ownerId: userId, isDeleted: false } });
    if (!folder) throw ApiError.badRequest('Target folder does not exist');
  }
  const updated = await prisma.file.update({ where: { id: fileId }, data: { folderId } });
  await recordAuditLog({ userId, action: 'FILE_MOVED', status: 'SUCCESS', metadata: { fileId, folderId } });
  return updated;
}

export async function softDeleteFile(fileId: string, userId: string) {
  await getOwnedFileOrThrow(fileId, userId);
  const permanentDeleteAt = new Date(Date.now() + env.RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.file.update({
      where: { id: fileId },
      data: { isDeleted: true, deletedAt: new Date(), permanentDeleteAt },
    }),
    prisma.recycleBinEntry.create({
      data: { fileId, ownerId: userId, permanentDeleteAt },
    }),
  ]);

  await recordAuditLog({ userId, action: 'FILE_DELETED', status: 'SUCCESS', metadata: { fileId } });
}

export async function restoreFile(fileId: string, userId: string) {
  const file = await prisma.file.findFirst({ where: { id: fileId, ownerId: userId, isDeleted: true } });
  if (!file) throw ApiError.notFound('File not found in recycle bin');

  await prisma.$transaction([
    prisma.file.update({ where: { id: fileId }, data: { isDeleted: false, deletedAt: null, permanentDeleteAt: null } }),
    prisma.recycleBinEntry.deleteMany({ where: { fileId } }),
  ]);

  await recordAuditLog({ userId, action: 'FILE_RESTORED', status: 'SUCCESS', metadata: { fileId } });
}

export async function permanentlyDeleteFile(fileId: string, userId: string) {
  const file = await prisma.file.findFirst({ where: { id: fileId, ownerId: userId, isDeleted: true } });
  if (!file) throw ApiError.notFound('File not found in recycle bin');

  const storage = getStorageAdapter();
  await storage.deleteObject(file.storedObjectKey);

  await prisma.$transaction([
    prisma.recycleBinEntry.deleteMany({ where: { fileId } }),
    prisma.file.delete({ where: { id: fileId } }),
    prisma.user.update({ where: { id: userId }, data: { storageUsedBytes: { decrement: file.sizeBytes } } }),
  ]);

  await recordAuditLog({ userId, action: 'FILE_PERMANENTLY_DELETED', status: 'SUCCESS', metadata: { fileId } });
}

export async function listRecycleBin(userId: string) {
  return prisma.file.findMany({
    where: { ownerId: userId, isDeleted: true },
    orderBy: { deletedAt: 'desc' },
    select: {
      id: true,
      originalFilename: true,
      sizeBytes: true,
      deletedAt: true,
      permanentDeleteAt: true,
    },
  });
}

/**
 * Background-job entry point: permanently purge recycle-bin items past
 * their retention period. Called by the cleanup job (spec section 28).
 */
export async function purgeExpiredRecycleBinEntries() {
  const expired = await prisma.file.findMany({
    where: { isDeleted: true, permanentDeleteAt: { lt: new Date() } },
  });

  const storage = getStorageAdapter();
  for (const file of expired) {
    await storage.deleteObject(file.storedObjectKey).catch(() => undefined);
    await prisma.recycleBinEntry.deleteMany({ where: { fileId: file.id } });
    await prisma.file.delete({ where: { id: file.id } });
    await prisma.user.update({ where: { id: file.ownerId }, data: { storageUsedBytes: { decrement: file.sizeBytes } } });
  }

  return expired.length;
}
