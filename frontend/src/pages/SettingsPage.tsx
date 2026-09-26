import { useUiStore } from '../store/uiStore';
import { Button, Card } from '../components/ui';

export default function SettingsPage() {
  const { theme, toggleTheme } = useUiStore();
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Appearance</h2>
        <p className="mb-3 text-sm text-gray-500">Current theme: {theme}</p>
        <Button variant="secondary" onClick={toggleTheme}>Toggle light / dark mode</Button>
      </Card>
    </div>
  );
}
