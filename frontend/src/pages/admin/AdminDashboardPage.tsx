import { useEffect, useState } from 'react';
import { Users, Files, HardDrive, ShieldAlert } from 'lucide-react';
import { api } from '../../services/api';
import { Card, Spinner } from '../../components/ui';
import { formatBytes } from '../../types';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  totalFiles: number;
  totalStorageUsedBytes: string;
  failedLogins24h: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => { api.get('/admin/stats').then((res) => setStats(res.data.data.stats)); }, []);

  if (!stats) return <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>;

  const cards = [
    { label: 'Total users', value: stats.totalUsers, icon: Users },
    { label: 'Blocked users', value: stats.blockedUsers, icon: ShieldAlert },
    { label: 'Total files', value: stats.totalFiles, icon: Files },
    { label: 'Storage used', value: formatBytes(stats.totalStorageUsedBytes), icon: HardDrive },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <Icon className="mb-2 h-6 w-6 text-brand-600" />
          <p className="text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </Card>
      ))}
      <Card className="sm:col-span-2 lg:col-span-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Failed logins in the last 24 hours: <span className="font-semibold">{stats.failedLogins24h}</span>
        </p>
      </Card>
    </div>
  );
}
