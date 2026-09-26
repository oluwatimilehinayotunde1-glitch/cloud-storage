import JSZip from 'jszip';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';
import { recordAuditLog } from './auditService';
import { getStorageAdapter } from './storageAdapter';
import { hybridDecryptFile, decryptFileBuffer } from '../crypto/hybridCrypto';
import { getRsaPrivateKey } from '../crypto/keyManager';
import { unwrapAesKeyWithKek } from '../crypto/vaultCrypto';

export async function createFolder(userId: string, name: string, parentId: string | null) {
  if (parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: parentId, ownerId: userId, isDeleted: false } });
    if (!parent) throw ApiError.badRequest('Parent folder does not exist');
  }

  const folder = await prisma.folder.create({ data: { ownerId: userId, name, parentId } });
  await recordAuditLog({ userId, action: 'FOLDER_CREATED', status: 'SUCCESS', metadata: { folderId: folder.id, name } });
  return folder;
}

/**
 * Recursively collects the ids of a folder and every folder nested
 * beneath it (children, grandchildren, ...), owned by the given user.
 * Used both for cascading delete and for recursive size/zip.
 */
async function collectFolderAndDescendantIds(userId: string, rootFolderId: string): Promise<string[]> {
  const all: string[] = [rootFolderId];
  let frontier = [rootFolderId];

  while (frontier.length > 0) {
    const children = await prisma.folder.findMany({
      where: { ownerId: userId, isDeleted: false, parentId: { in: frontier } },
      select: { id: true },
    });
    if (children.length === 0) break;
    const childIds = children.map((c: { id: string }) => c.id);
    all.push(...childIds);
    frontier = childIds;
  }

  return all;
}

/**
 * A folder's "size" is the total size of every non-deleted file
 * anywhere underneath it, including in subfolders - not just files
 * directly inside it. Computed on read rather than maintained as a
 * running total: simpler and correct-by-construction, at the cost of
 * an extra query per listing (acceptable at this project's scale).
 */
export async function listFolders(userId: string, parentId: string | null | undefined) {
  const folders = await prisma.folder.findMany({
    where: { ownerId: userId, isDeleted: false, parentId: parentId === undefined ? undefined : parentId },
    orderBy: { name: 'asc' },
  });

  const withSizes = await Promise.all(
    folders.map(async (folder: { id: string }) => {
      const descendantIds = await collectFolderAndDescendantIds(userId, folder.id);
      const agg = await prisma.file.aggregate({
        where: { ownerId: userId, isDeleted: false, folderId: { in: descendantIds } },
        _sum: { sizeBytes: true },
        _count: true,
      });
      return {
        ...folder,
        sizeBytes: agg._sum.sizeBytes ?? BigInt(0),
        fileCount: agg._count,
      };
    })
  );

  return withSizes;
}

export async function renameFolder(userId: string, folderId: string, name: string) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, ownerId: userId, isDeleted: false } });
  if (!folder) throw ApiError.notFound('Folder not found');
  return prisma.folder.update({ where: { id: folderId }, data: { name } });
}

/**
 * Deletes a folder AND everything inside it, recursively: every
 * nested subfolder, and every file anywhere underneath any of them.
 * Files are soft-deleted the same way single-file delete works (see
 * fileService.ts), so they land in the Recycle Bin rather than
 * vanishing - fixing the earlier bug where files under a deleted
 * folder became invisible/orphaned instead.
 */
export async function deleteFolder(userId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, ownerId: userId, isDeleted: false } });
  if (!folder) throw ApiError.notFound('Folder not found');

  const allFolderIds = await collectFolderAndDescendantIds(userId, folderId);

  const now = new Date();
  await prisma.$transaction([
    prisma.folder.updateMany({
      where: { id: { in: allFolderIds }, ownerId: userId },
      data: { isDeleted: true, deletedAt: now },
    }),
    prisma.file.updateMany({
      where: { ownerId: userId, isDeleted: false, folderId: { in: allFolderIds } },
      data: { isDeleted: true, deletedAt: now },
    }),
  ]);

  await recordAuditLog({
    userId,
    action: 'FOLDER_DELETED',
    status: 'SUCCESS',
    metadata: { folderId, cascadedFolderCount: allFolderIds.length },
  });
}

/**
 * Builds a ZIP of every file recursively under the given folder,
 * preserving the subfolder structure as paths inside the archive.
 *
 * Vault-protected files: if the caller has an active vault session,
 * they're included (decrypted via the vault path, same as a normal
 * single-file vault download). Without one, vault-protected files are
 * SKIPPED (not failed outright) so a folder with a mix of protected
 * and unprotected files still produces a useful zip - the response
 * tells the caller how many were skipped so the frontend can inform
 * the user, rather than silently dropping files.
 */
export async function downloadFolderAsZip(
  userId: string,
  folderId: string,
  vault?: { kek: Buffer; kekSource: 'vault' | 'recovery' }
) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, ownerId: userId, isDeleted: false } });
  if (!folder) throw ApiError.notFound('Folder not found');

  const allFolderIds = await collectFolderAndDescendantIds(userId, folderId);
  const foldersById = await prisma.folder.findMany({ where: { id: { in: allFolderIds } } });
  const folderPathById = new Map<string, string>();
  folderPathById.set(folderId, '');
  // Folders are collected breadth-first from the root, so by the time
  // we reach any folder here, its parent's path has already been set.
  for (const f of foldersById) {
    if (f.id === folderId) continue;
    const parentPath = f.parentId ? folderPathById.get(f.parentId) ?? '' : '';
    folderPathById.set(f.id, `${parentPath}${f.name}/`);
  }

  const files = await prisma.file.findMany({
    where: { ownerId: userId, isDeleted: false, folderId: { in: allFolderIds } },
    include: { encryptionMetadata: true },
  });

  if (files.length === 0) throw ApiError.badRequest('This folder has no files to download');

  const zip = new JSZip();
  const storage = getStorageAdapter();
  let skippedVaultProtected = 0;

  for (const file of files) {
    if (!file.encryptionMetadata) continue; // shouldn't happen, but never let one bad row fail the whole zip

    const folderPath = folderPathById.get(file.folderId ?? folderId) ?? '';
    const zipPath = `${folder.name}/${folderPath}${file.originalFilename}`;

    if (file.vaultProtected) {
      if (!vault) {
        skippedVaultProtected += 1;
        continue;
      }
      const meta = file.encryptionMetadata;
      const wrappedField = vault.kekSource === 'vault' ? meta.vaultWrappedAesKey : meta.recoveryWrappedAesKey;
      const ivField = vault.kekSource === 'vault' ? meta.vaultWrapIv : meta.recoveryWrapIv;
      const authTagField = vault.kekSource === 'vault' ? meta.vaultWrapAuthTag : meta.recoveryWrapAuthTag;
      if (!wrappedField || !ivField || !authTagField) {
        skippedVaultProtected += 1;
        continue;
      }
      try {
        const ciphertext = await storage.getObject(file.storedObjectKey);
        const aesKey = unwrapAesKeyWithKek({ wrappedKeyB64: wrappedField, ivB64: ivField, authTagB64: authTagField }, vault.kek);
        const plaintext = decryptFileBuffer(ciphertext, aesKey, Buffer.from(meta.iv, 'base64'), Buffer.from(meta.authTag, 'base64'));
        aesKey.fill(0);
        zip.file(zipPath, plaintext);
      } catch {
        skippedVaultProtected += 1;
      }
      continue;
    }

    const ciphertext = await storage.getObject(file.storedObjectKey);
    const plaintext = hybridDecryptFile(
      ciphertext,
      file.encryptionMetadata.iv,
      file.encryptionMetadata.authTag,
      file.encryptionMetadata.encryptedAesKey,
      getRsaPrivateKey(),
      file.sha256Hash
    );
    zip.file(zipPath, plaintext);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  await recordAuditLog({ userId, action: 'FILE_DOWNLOADED', status: 'SUCCESS', metadata: { folderId, zipped: true, skippedVaultProtected } });

  return { buffer, filename: `${folder.name}.zip`, skippedVaultProtected };
}
