import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../services/api';
import { Button, Card, Input } from '../components/ui';

interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);

  const password = watch('password');

  async function onSubmit(data: RegisterForm) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/register', data);
      setVerificationRequired(Boolean(res.data?.data?.user?.verificationRequired));
      setSuccess(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <Card className="w-full max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
            {verificationRequired ? 'Check your email' : 'Account created'}
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            {verificationRequired
              ? "We've sent a verification link to your email address. Verify your account, then sign in."
              : "Your account is ready. We've also emailed you a verification link you can confirm at any time."}
          </p>
          <Link to="/login"><Button className="w-full">Go to sign in</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900 dark:text-white">Create your account</h1>
        <p className="mb-6 text-sm text-gray-500">Your files are encrypted before they ever leave the server.</p>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" {...register('firstName', { required: 'Required' })} error={errors.firstName?.message} />
            <Input label="Last name" {...register('lastName', { required: 'Required' })} error={errors.lastName?.message} />
          </div>

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            {...register('email', {
              required: 'Required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
            })}
            error={errors.email?.message}
          />

          {/* Mirrors the backend Zod rule so the user isn't bounced by a server error. */}
          <Input
            label="Username"
            autoComplete="username"
            {...register('username', {
              required: 'Required',
              minLength: { value: 3, message: 'At least 3 characters' },
              maxLength: { value: 30, message: 'At most 30 characters' },
              pattern: {
                value: /^[a-zA-Z0-9_.]+$/,
                message: 'Letters, numbers, underscore and dot only',
              },
            })}
            error={errors.username?.message}
          />

          {/* Mirrors validatePasswordStrength() in backend/src/utils/password.ts. */}
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            {...register('password', {
              required: 'Required',
              minLength: { value: 8, message: 'At least 8 characters' },
              validate: (value) => {
                if (!/[A-Z]/.test(value)) return 'Must contain an uppercase letter';
                if (!/[a-z]/.test(value)) return 'Must contain a lowercase letter';
                if (!/[0-9]/.test(value)) return 'Must contain a number';
                return true;
              },
            })}
            error={errors.password?.message}
          />

          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword', {
              required: 'Required',
              validate: (value) => value === password || 'Passwords do not match',
            })}
            error={errors.confirmPassword?.message}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account? <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
