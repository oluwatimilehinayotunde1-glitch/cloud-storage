import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { EmptyState, Spinner } from '../components/ui';
import { formatBytes } from '../types';

interface DeletedFile {
  id: string;
  originalFilename: string;
  sizeBytes: string;
  deletedAt: string;
  permanentDeleteAt: string;
}

export default function RecycleBinPage() {
  const [files, setFiles] = useState<DeletedFile[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get('/recycle-bin');
    setFiles(res.data.data.files);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function restore(id: string) {
    await api.post(`/recycle-bin/${id}/restore`);
    load();
  }

  async function permanentDelete(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    await api.delete(`/recycle-bin/${id}`);
    load();
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Recycle Bin</h1>
        <p className="text-sm text-gray-500">Deleted files are kept here temporarily before permanent removal.</p>
      </div>
      {files.length === 0 ? (
        <EmptyState title="Recycle bin is empty" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Deleted</th>
                <th className="px-4 py-3">Permanently deleted on</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{f.originalFilename}</td>
                  <td className="px-4 py-3 text-gray-500">{formatBytes(f.sizeBytes)}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(f.deletedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(f.permanentDeleteAt).toLocaleDateString()}</td>
                  <td className="flex justify-end gap-2 px-4 py-3">
                    <button onClick={() => restore(f.id)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" title="Restore">
                      <RotateCcw className="h-4 w-4 text-brand-600" />
                    </button>
                    <button onClick={() => permanentDelete(f.id, f.originalFilename)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" title="Delete permanently">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
