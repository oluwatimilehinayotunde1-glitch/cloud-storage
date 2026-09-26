import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, Card, Input } from '../components/ui';

interface LoginForm {
  identifier: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();
  const [error, setError] = useState<string | null>(null);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingCreds, setPendingCreds] = useState<LoginForm | null>(null);

  async function attemptLogin(data: LoginForm, code?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { ...data, totpCode: code });
      setAuth(res.data.data.accessToken, res.data.data.user);
      navigate('/dashboard');
    } catch (err) {
      const message = apiErrorMessage(err);
      if (message === 'TOTP_REQUIRED') {
        setNeedsTotp(true);
        setPendingCreds(data);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900 dark:text-white">Welcome back</h1>
        <p className="mb-6 text-sm text-gray-500">Sign in to your SecureVault account</p>

        {!needsTotp ? (
          <form className="space-y-4" onSubmit={handleSubmit((data) => attemptLogin(data))}>
            <Input
              label="Email or username"
              {...register('identifier', { required: 'Required' })}
              error={errors.identifier?.message}
            />
            <Input
              label="Password"
              type="password"
              {...register('password', { required: 'Required' })}
              error={errors.password?.message}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (pendingCreds) attemptLogin(pendingCreds, totpCode);
            }}
          >
            <p className="text-sm text-gray-600 dark:text-gray-300">Enter the 6-digit code from your authenticator app.</p>
            <Input label="Authenticator code" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} maxLength={6} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & sign in'}
            </Button>
          </form>
        )}

        <div className="mt-4 flex justify-between text-sm">
          <Link to="/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
          <Link to="/register" className="text-brand-600 hover:underline">Create an account</Link>
        </div>
      </Card>
    </div>
  );
}
