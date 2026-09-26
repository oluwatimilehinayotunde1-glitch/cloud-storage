import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { EmptyState, Spinner } from '../components/ui';

interface LogEntry {
  id: string;
  action: string;
  status: string;
  ipAddress: string | null;
  createdAt: string;
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/activity').then((res) => { setLogs(res.data.data.logs); setLoading(false); });
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Account Activity</h1>
      {logs.length === 0 ? (
        <EmptyState title="No activity recorded yet" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr><th className="px-4 py-3">Action</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">When</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{l.action}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{l.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{l.ipAddress ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
