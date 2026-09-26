import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Endpoints that must never trigger the silent-refresh retry: refreshing
 * because one of these returned 401 would either recurse or retry a login
 * that legitimately failed.
 *
 * Previously this excluded every path containing "/auth/", which also
 * covered /auth/me, /auth/sessions and /auth/change-password — so once the
 * 15-minute access token expired, the Profile and Security pages failed
 * permanently instead of refreshing.
 */
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout'];

function shouldSkipRefresh(url?: string): boolean {
  if (!url) return false;
  return NO_REFRESH_PATHS.some((path) => url.includes(path));
}

let isRefreshing = false;
let pendingQueue: Array<(ok: boolean) => void> = [];

function flushQueue(ok: boolean) {
  pendingQueue.forEach((resolve) => resolve(ok));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest?._retry && !shouldSkipRefresh(originalRequest?.url)) {
      if (isRefreshing) {
        // Wait for the in-flight refresh to finish, then retry (or give up).
        const ok = await new Promise<boolean>((resolve) => pendingQueue.push(resolve));
        if (!ok) return Promise.reject(error);
        originalRequest._retry = true;
        return api(originalRequest);
      }

      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const { data } = await api.post('/auth/refresh');
        useAuthStore.getState().setAccessToken(data.data.accessToken);
        flushQueue(true);
        return api(originalRequest);
      } catch (refreshError) {
        flushQueue(false);
        useAuthStore.getState().clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as any)?.message ?? err.message;
  }
  return 'Something went wrong. Please try again.';
}
