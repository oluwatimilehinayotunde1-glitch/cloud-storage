import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';
import { generateShareToken } from '../utils/jwt';
import { getStorageAdapter } from './storageAdapter';
import { hybridDecryptFile } from '../crypto/hybridCrypto';
import { getRsaPrivateKey } from '../crypto/keyManager';
import { recordAuditLog } from './auditService';
import { downloadFolderAsZip } from './folderService';

interface CreateShareParams {
  /** Exactly one of fileId/folderId must be provided. */
  fileId?: string;
  folderId?: string;
  userId: string;
  expiresInHours?: number;
  maxDownloads?: number;
  downloadPolicy?: 'ALLOWED' | 'BLOCKED';
}

export async function createShare(params: CreateShareParams) {
  const { fileId, folderId, userId, expiresInHours, maxDownloads, downloadPolicy } = params;

  if (!fileId && !folderId) throw ApiError.badRequest('A file or folder must be specified to create a share');
  if (fileId && folderId) throw ApiError.badRequest('A share can target a file or a folder, not both');

  if (fileId) {
    const file = await prisma.file.findFirst({ where: { id: fileId, ownerId: userId, isDeleted: false } });
    if (!file) throw ApiError.notFound('File not found');

    // Vault-protected files cannot be shared via an anonymous public
    // link: accessSharedResource() below has no logged-in user and thus
    // no way to obtain a vault-unlock session, so a share link would
    // have to bypass the vault requirement entirely - silently
    // defeating it. See the README's "Vault Mode" section.
    if (file.vaultProtected) {
      throw ApiError.badRequest(
        'This file is vault-protected and cannot be shared via a public link. Disable vault protection for this file first, or share a non-vault copy.'
      );
    }
  } else {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, ownerId: userId, isDeleted: false } });
    if (!folder) throw ApiError.notFound('Folder not found');
    // Unlike a single file, a folder share is allowed to exist even if
    // SOME files inside it are vault-protected - those individual
    // files are simply excluded from the zip at access time (see
    // folderService.downloadFolderAsZip), same rule as single-file
    // sharing applied per-file instead of to the whole share.
  }

  const share = await prisma.fileShare.create({
    data: {
      fileId: fileId ?? null,
      folderId: folderId ?? null,
      createdById: userId,
      token: generateShareToken(),
      expiresAt: expiresInHours ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000) : null,
      maxDownloads: maxDownloads ?? null,
      downloadPolicy: downloadPolicy ?? 'ALLOWED',
    },
  });

  await recordAuditLog({
    userId,
    action: 'FILE_SHARED',
    status: 'SUCCESS',
    metadata: fileId ? { fileId, shareId: share.id } : { folderId, shareId: share.id },
  });

  return share;
}

export async function revokeShare(userId: string, shareId: string) {
  const share = await prisma.fileShare.findFirst({ where: { id: shareId, createdById: userId } });
  if (!share) throw ApiError.notFound('Share not found');
  await prisma.fileShare.update({ where: { id: shareId }, data: { isRevoked: true } });
  await recordAuditLog({ userId, action: 'FILE_SHARE_REVOKED', status: 'SUCCESS', metadata: { shareId } });
}

export async function listMyShares(userId: string) {
  return prisma.fileShare.findMany({
    where: { createdById: userId },
    include: {
      file: { select: { originalFilename: true, sizeBytes: true } },
      folder: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Public: resolve a share token and, if valid, return the shared
 * content - a decrypted file, or a ZIP of a whole folder. No logged-in
 * user is involved (this is the anonymous public-link endpoint), which
 * is exactly why vault-protected content can never come out of this
 * path - see the vault-protection checks in createShare() and
 * folderService.downloadFolderAsZip().
 */
export async function accessSharedResource(token: string) {
  const share = await prisma.fileShare.findUnique({
    where: { token },
    include: { file: { include: { encryptionMetadata: true } }, folder: true },
  });

  if (!share || share.isRevoked) throw ApiError.notFound('This share link is invalid or has been revoked');
  if (share.expiresAt && share.expiresAt < new Date()) throw ApiError.forbidden('This share link has expired');
  if (share.downloadPolicy === 'BLOCKED') throw ApiError.forbidden('Downloads are disabled for this share');
  if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
    throw ApiError.forbidden('This share link has reached its download limit');
  }

  if (share.folderId) {
    if (!share.folder || share.folder.isDeleted) throw ApiError.notFound('The shared folder no longer exists');
    const { buffer, filename } = await downloadFolderAsZip(share.createdById, share.folderId);
    await prisma.fileShare.update({ where: { id: share.id }, data: { downloadCount: { increment: 1 } } });
    return { buffer, filename, mimeType: 'application/zip' };
  }

  if (!share.file || share.file.isDeleted) throw ApiError.notFound('The shared file no longer exists');
  if (!share.file.encryptionMetadata) throw ApiError.internal('File is missing encryption metadata');

  const storage = getStorageAdapter();
  const ciphertext = await storage.getObject(share.file.storedObjectKey);

  const plaintext = hybridDecryptFile(
    ciphertext,
    share.file.encryptionMetadata.iv,
    share.file.encryptionMetadata.authTag,
    share.file.encryptionMetadata.encryptedAesKey,
    getRsaPrivateKey(),
    share.file.sha256Hash
  );

  await prisma.fileShare.update({ where: { id: share.id }, data: { downloadCount: { increment: 1 } } });

  return { buffer: plaintext, filename: share.file.originalFilename, mimeType: share.file.mimeType };
}
