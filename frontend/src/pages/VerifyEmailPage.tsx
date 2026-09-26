import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../services/api';
import { Card } from '../components/ui';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(apiErrorMessage(err));
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <Card className="w-full max-w-md text-center">
        {status === 'loading' && <p className="text-sm text-gray-500">Verifying your email...</p>}
        {status === 'success' && (
          <>
            <h1 className="mb-2 text-xl font-semibold text-green-600">Email verified!</h1>
            <Link to="/login" className="text-brand-600 hover:underline">Continue to sign in</Link>
          </>
        )}
        {status === 'error' && <p className="text-sm text-red-600">{message}</p>}
      </Card>
    </div>
  );
}
