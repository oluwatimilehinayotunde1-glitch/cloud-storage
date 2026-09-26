import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../services/api';
import { Button, Card, Input } from '../components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900 dark:text-white">Forgot password</h1>
        <p className="mb-6 text-sm text-gray-500">We&apos;ll email you a link to reset it.</p>

        {sent ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            If an account exists for that email, a reset link has been sent. Check your inbox.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-gray-500">
          <Link to="/login" className="text-brand-600 hover:underline">Back to sign in</Link>
        </p>
      </Card>
    </div>
  );
}
