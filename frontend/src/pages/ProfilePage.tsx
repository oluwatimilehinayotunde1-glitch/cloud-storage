import { useAuthStore } from '../store/authStore';
import { Card } from '../components/ui';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Profile</h1>
      <Card>
        <dl className="space-y-3 text-sm">
          <Row label="First name" value={user?.firstName} />
          <Row label="Last name" value={user?.lastName} />
          <Row label="Username" value={user?.username} />
          <Row label="Email" value={user?.email} />
          <Row label="Role" value={user?.role} />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800 dark:text-gray-200">{value}</dd>
    </div>
  );
}
