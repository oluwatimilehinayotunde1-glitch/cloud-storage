import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HardDrive, Files, Share2 } from 'lucide-react';
import { api } from '../services/api';
import { Card, Spinner } from '../components/ui';
import { formatBytes } from '../types';

interface Overview {
  storageUsedBytes: string;
  storageQuotaBytes: string;
  totalFiles: number;
  recentFiles: { id: string; originalFilename: string; sizeBytes: string; createdAt: string }[];
  recentShares: { id: string; token: string; file: { originalFilename: string } }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api.get('/activity/dashboard').then((res) => setData(res.data.data));
  }, []);

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const used = Number(data.storageUsedBytes);
  const quota = Number(data.storageQuotaBytes);
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <Files className="h-8 w-8 text-brand-600" />
            <div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{data.totalFiles}</p>
              <p className="text-sm text-gray-500">Total files</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <HardDrive className="h-8 w-8 text-brand-600" />
            <div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{formatBytes(used)}</p>
              <p className="text-sm text-gray-500">of {formatBytes(quota)} used</p>
            </div>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
            <div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Share2 className="h-8 w-8 text-brand-600" />
            <div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{data.recentShares.length}</p>
              <p className="text-sm text-gray-500">Recent shares</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Recent files</h2>
          {data.recentFiles.length === 0 ? (
            <p className="text-sm text-gray-400">No files yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.recentFiles.map((f) => (
                <li key={f.id} className="py-2 text-sm text-gray-700 dark:text-gray-300">{f.originalFilename}</li>
              ))}
            </ul>
          )}
          <Link to="/files" className="mt-3 block text-sm text-brand-600 hover:underline">View all files →</Link>
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Recently shared</h2>
          {data.recentShares.length === 0 ? (
            <p className="text-sm text-gray-400">No shares yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.recentShares.map((s) => (
                <li key={s.id} className="py-2 text-sm text-gray-700 dark:text-gray-300">{s.file.originalFilename}</li>
              ))}
            </ul>
          )}
          <Link to="/shared" className="mt-3 block text-sm text-brand-600 hover:underline">View all shares →</Link>
        </Card>
      </div>
    </div>
  );
}
