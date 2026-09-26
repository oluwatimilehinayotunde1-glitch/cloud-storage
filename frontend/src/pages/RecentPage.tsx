import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { EmptyState, Spinner } from '../components/ui';
import { FileItem, formatBytes } from '../types';

export default function RecentPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/files', { params: { folderId: undefined } }).then((res) => {
      const sorted = [...res.data.data.files].sort(
        (a: FileItem, b: FileItem) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setFiles(sorted.slice(0, 20));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Recent</h1>
      {files.length === 0 ? (
        <EmptyState title="No recent files" />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-gray-800 dark:text-gray-200">{f.originalFilename}</span>
              <span className="text-gray-400">{formatBytes(f.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
