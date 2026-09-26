export interface FileItem {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  isEncrypted: boolean;
  encryptionAlgorithm: string;
  vaultProtected: boolean;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  /** Recursive total size of every file anywhere under this folder (string, since bigint serializes as string). */
  sizeBytes: string;
  fileCount: number;
}

export interface ShareItem {
  id: string;
  token: string;
  expiresAt: string | null;
  isRevoked: boolean;
  downloadCount: number;
  maxDownloads: number | null;
  createdAt: string;
  file: { originalFilename: string };
}

export function formatBytes(bytes: number | string): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
