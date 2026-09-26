import { useEffect, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { EmptyState, Spinner } from '../components/ui';
import { ShareItem, formatBytes } from '../types';

export default function SharedPage() {
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get('/shares');
    setShares(res.data.data.shares);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function revoke(id: string) {
    if (!confirm('Revoke this share link? It will stop working immediately.')) return;
    await api.delete(`/shares/${id}`);
    load();
  }

  function shareUrl(token: string) {
    return `${window.location.origin}/share/${token}`;
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Shared Files</h1>
      {shares.length === 0 ? (
        <EmptyState title="No shared files yet" subtitle="Share a file from My Files to see it here" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Downloads</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {shares.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{s.file.originalFilename}</td>
                  <td className="px-4 py-3 text-gray-500">{s.downloadCount}{s.maxDownloads ? ` / ${s.maxDownloads}` : ''}</td>
                  <td className="px-4 py-3 text-gray-500">{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : 'Never'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.isRevoked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {s.isRevoked ? 'Revoked' : 'Active'}
                    </span>
                  </td>
                  <td className="flex justify-end gap-2 px-4 py-3">
                    <button onClick={() => navigator.clipboard.writeText(shareUrl(s.token))} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" title="Copy link">
                      <Copy className="h-4 w-4 text-gray-400" />
                    </button>
                    {!s.isRevoked && (
                      <button onClick={() => revoke(s.id)} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" title="Revoke">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    )}
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
