import { create } from 'zustand';

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  totpEnabled: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: CurrentUser | null;
  setAuth: (accessToken: string, user: CurrentUser) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
}

// Access token is kept only in memory (React state), never localStorage,
// to reduce exposure to XSS. Refresh token lives in an httpOnly cookie.
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearAuth: () => set({ accessToken: null, user: null }),
}));
