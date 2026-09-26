import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { EmptyState, Spinner } from '../../components/ui';

interface SecurityEvent {
  id: string; eventType: string; severity: string; description: string; createdAt: string;
  user: { username: string; email: string } | null;
}

export default function AdminSecurityPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/security-events').then((res) => { setEvents(res.data.data.events); setLoading(false); });
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>;
  if (events.length === 0) return <EmptyState title="No security events recorded" />;

  const severityColor: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-700', MEDIUM: 'bg-yellow-100 text-yellow-700', LOW: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-3">
      {events.map((e) => (
        <div key={e.id} className="flex items-start justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityColor[e.severity]}`}>{e.severity}</span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{e.eventType}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{e.description}</p>
            {e.user && <p className="mt-1 text-xs text-gray-400">User: {e.user.username} ({e.user.email})</p>}
          </div>
          <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
