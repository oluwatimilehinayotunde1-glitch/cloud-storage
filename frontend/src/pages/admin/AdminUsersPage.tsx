import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button, Spinner } from '../../components/ui';
import { formatBytes } from '../../types';

interface AdminUser {
  id: string; firstName: string; lastName: string; email: string; username: string;
  role: string; isBlocked: boolean; isEmailVerified: boolean;
  storageUsedBytes: string; storageQuotaBytes: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get('/admin/users');
    setUsers(res.data.data.users);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggleBlock(u: AdminUser) {
    if (u.isBlocked) await api.post(`/admin/users/${u.id}/unblock`);
    else await api.post(`/admin/users/${u.id}/block`);
    load();
  }

  async function remove(u: AdminUser) {
    if (!confirm(`Delete user ${u.username}? This cannot be undone.`)) return;
    await api.delete(`/admin/users/${u.id}`);
    load();
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Storage</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-800 dark:text-gray-200">{u.firstName} {u.lastName}</p>
                <p className="text-xs text-gray-400">{u.email} · @{u.username}</p>
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.role}</td>
              <td className="px-4 py-3 text-gray-500">{formatBytes(u.storageUsedBytes)} / {formatBytes(u.storageQuotaBytes)}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.isBlocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {u.isBlocked ? 'Blocked' : 'Active'}
                </span>
              </td>
              <td className="flex justify-end gap-2 px-4 py-3">
                <Button variant="ghost" onClick={() => toggleBlock(u)}>{u.isBlocked ? 'Unblock' : 'Block'}</Button>
                <Button variant="ghost" onClick={() => remove(u)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
