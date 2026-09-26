import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Upload, File as FileIcon, Folder as FolderIcon, MoreVertical, Download,
  Trash2, Share2, Edit2, FolderPlus, Search, ChevronRight, Lock, ShieldCheck,
} from 'lucide-react';
import { api, apiErrorMessage } from '../services/api';
import { Button, EmptyState, Spinner } from '../components/ui';
import VaultModal from '../components/VaultModal';
import { useVaultStore } from '../store/vaultStore';
import { FileItem, FolderItem, formatBytes } from '../types';

export default function FilesPage() {
  const [params, setParams] = useSearchParams();
  const folderId = params.get('folder'); // null = root

  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDownload, setPendingDownload] = useState<FileItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const unlocked = useVaultStore((s) => s.unlocked);
  const isExpired = useVaultStore((s) => s.isExpired);
  const markLocked = useVaultStore((s) => s.markLocked);

  // The server independently enforces vault-session expiry on every
  // download request regardless of this - this just keeps the lock
  // icons in sync with reality without needing a page refresh.
  useEffect(() => {
    const id = setInterval(() => { if (unlocked && isExpired()) markLocked(); }, 5000);
    return () => clearInterval(id);
  }, [unlocked, isExpired, markLocked]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [filesRes, foldersRes] = await Promise.all([
        api.get('/files', { params: { folderId: folderId ?? 'root', search: search || undefined } }),
        api.get('/folders', { params: { parentId: folderId ?? 'root' } }),
      ]);
      setFiles(filesRes.data.data.files);
      setFolders(foldersRes.data.data.folders);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [folderId, search]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      Array.from(fileList).forEach((f) => formData.append('files', f));
      if (folderId) formData.append('folderId', folderId);
      await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(file: FileItem) {
    // Read the freshest store value directly rather than the `unlocked`
    // hook snapshot: this can be called from VaultModal's onUnlocked
    // callback in the same tick markUnlocked() runs, before FilesPage
    // has re-rendered with the updated snapshot.
    const isUnlockedNow = useVaultStore.getState().unlocked;
    if (file.vaultProtected && !isUnlockedNow) {
      // Don't even attempt the request - just open the unlock modal and
      // retry once it succeeds. The server would reject this anyway
      // (see fileService.downloadFile), but there's no reason to round-trip
      // for a request we already know is missing its vault session.
      setOpenMenuId(null);
      setPendingDownload(file);
      return;
    }
    try {
      const res = await api.get(`/files/${file.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalFilename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // A previously-unlocked session can still expire server-side
      // between page load and this click - if that's why it failed,
      // re-prompt instead of showing a raw error.
      const code = (err as any)?.response?.data?.code;
      if (code === 'VAULT_LOCKED' || code === 'VAULT_UNLOCK_EXPIRED' || code === 'VAULT_UNLOCK_INVALID') {
        markLocked();
        setPendingDownload(file);
      } else {
        setError(apiErrorMessage(err));
      }
    }
  }

  async function handleDelete(file: FileItem) {
    if (!confirm(`Move "${file.originalFilename}" to the recycle bin?`)) return;
    await api.delete(`/files/${file.id}`);
    load();
  }

  async function handleRename(file: FileItem) {
    const name = prompt('New filename', file.originalFilename);
    if (!name) return;
    await api.patch(`/files/${file.id}`, { name });
    load();
  }

  async function handleShare(file: FileItem) {
    const res = await api.post(`/files/${file.id}/share`, { expiresInHours: 168 });
    await navigator.clipboard.writeText(res.data.data.url).catch(() => undefined);
    alert(`Share link created (copied to clipboard):\n${res.data.data.url}`);
  }

  async function handleCreateFolder() {
    const name = prompt('Folder name');
    if (!name) return;
    await api.post('/folders', { name, parentId: folderId });
    load();
  }

  async function handleDeleteFolder(folder: FolderItem) {
    if (!confirm(`Delete "${folder.name}" and everything inside it (subfolders included)? Files will go to the Recycle Bin.`)) return;
    try {
      await api.delete(`/folders/${folder.id}`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleRenameFolder(folder: FolderItem) {
    const name = prompt('New folder name', folder.name);
    if (!name) return;
    try {
      await api.patch(`/folders/${folder.id}`, { name });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleShareFolder(folder: FolderItem) {
    try {
      const res = await api.post(`/folders/${folder.id}/share`, { expiresInHours: 168 });
      await navigator.clipboard.writeText(res.data.data.url).catch(() => undefined);
      alert(`Share link created (copied to clipboard):\n${res.data.data.url}\n\nAnyone with this link can download the folder as a ZIP. Vault-protected files inside are excluded.`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleDownloadFolder(folder: FolderItem) {
    try {
      const res = await api.get(`/folders/${folder.id}/download`, { responseType: 'blob' });
      const skipped = res.headers['x-vault-skipped-count'];
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder.name}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
      if (skipped && Number(skipped) > 0) {
        alert(`${skipped} vault-protected file(s) inside were skipped. Unlock the vault and download again to include them.`);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">My Files</h1>
          <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
            <span className="cursor-pointer hover:underline" onClick={() => setParams({})}>My Drive</span>
            {folderId && <><ChevronRight className="h-3 w-3" /><span>Current folder</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <Button variant="secondary" onClick={handleCreateFolder}>
            <FolderPlus className="h-4 w-4" /> New folder
          </Button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Drag & drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
        className={`rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${
          dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 text-gray-400 dark:border-gray-800'
        }`}
      >
        Drag and drop files here, or click Upload above. Files are encrypted (AES-256-GCM) before they leave the server.
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>
      ) : folders.length === 0 && files.length === 0 ? (
        <EmptyState title="This folder is empty" subtitle="Upload a file or create a folder to get started" />
      ) : (
        <div className="overflow-visible rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Modified</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {folders.map((folder) => (
                <tr key={folder.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900" onClick={() => setParams({ folder: folder.id })}>
                  <td className="flex items-center gap-2 px-4 py-3 text-gray-800 dark:text-gray-200">
                    <FolderIcon className="h-4 w-4 text-brand-500" /> {folder.name}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatBytes(folder.sizeBytes)}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(folder.createdAt).toLocaleDateString()}</td>
                  <td className="relative px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === `folder-${folder.id}` ? null : `folder-${folder.id}`); }}
                      className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <MoreVertical className="h-4 w-4 text-gray-400" />
                    </button>
                    {openMenuId === `folder-${folder.id}` && (
                      <div className="absolute right-4 top-10 z-10 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
                        <MenuItem icon={Download} label="Download as ZIP" onClick={() => handleDownloadFolder(folder)} />
                        <MenuItem icon={Share2} label="Share" onClick={() => handleShareFolder(folder)} />
                        <MenuItem icon={Edit2} label="Rename" onClick={() => handleRenameFolder(folder)} />
                        <MenuItem icon={Trash2} label="Delete" onClick={() => handleDeleteFolder(folder)} danger />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="flex items-center gap-2 px-4 py-3 text-gray-800 dark:text-gray-200">
                    <FileIcon className="h-4 w-4 text-gray-400" /> {file.originalFilename}
                    {file.vaultProtected && (
                      <span title={unlocked ? 'Vault-protected (unlocked)' : 'Vault-protected (locked)'}>
                        {unlocked
                          ? <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                          : <Lock className="h-3.5 w-3.5 text-amber-500" />}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatBytes(file.sizeBytes)}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(file.updatedAt).toLocaleDateString()}</td>
                  <td className="relative px-4 py-3 text-right">
                    <button onClick={() => setOpenMenuId(openMenuId === file.id ? null : file.id)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                      <MoreVertical className="h-4 w-4 text-gray-400" />
                    </button>
                    {openMenuId === file.id && (
                      <div className="absolute right-4 top-10 z-10 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                        {file.vaultProtected && !unlocked ? (
                          <MenuItem icon={Lock} label="Unlock to download" onClick={() => handleDownload(file)} />
                        ) : (
                          <MenuItem icon={Download} label="Download" onClick={() => handleDownload(file)} />
                        )}
                        <MenuItem icon={Share2} label="Share" onClick={() => handleShare(file)} />
                        <MenuItem icon={Edit2} label="Rename" onClick={() => handleRename(file)} />
                        <MenuItem icon={Trash2} label="Delete" onClick={() => handleDelete(file)} danger />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingDownload && (
        <VaultModal
          initialMode="unlock"
          onClose={() => setPendingDownload(null)}
          onUnlocked={() => {
            const file = pendingDownload;
            setPendingDownload(null);
            if (file) handleDownload(file);
          }}
        />
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Download; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${danger ? 'text-red-600' : 'text-gray-700 dark:text-gray-200'}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
