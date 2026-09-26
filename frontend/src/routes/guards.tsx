import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Spinner } from '../components/ui';

/**
 * On app load there is no access token yet (it lives only in memory).
 * We attempt a silent refresh using the httpOnly cookie before deciding
 * whether the user is authenticated.
 *
 * We also (re)load /auth/me whenever the profile is missing — the response
 * interceptor can mint a fresh access token without ever populating `user`,
 * and AdminRoute below reads `user.role`.
 */
export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [checking, setChecking] = useState(!accessToken || !user);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        let token = useAuthStore.getState().accessToken;

        if (!token) {
          const res = await api.post('/auth/refresh');
          token = res.data.data.accessToken as string;
          useAuthStore.getState().setAccessToken(token);
        }

        if (!useAuthStore.getState().user) {
          const me = await api.get('/auth/me');
          if (!cancelled) {
            useAuthStore.getState().setAuth(useAuthStore.getState().accessToken!, me.data.data.user);
          }
        }
      } catch {
        if (!cancelled) useAuthStore.getState().clearAuth();
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    if (!accessToken || !user) {
      bootstrap();
    } else {
      setChecking(false);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
