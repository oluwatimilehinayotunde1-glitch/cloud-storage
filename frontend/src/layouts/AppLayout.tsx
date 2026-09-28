import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Folder, Share2, Clock, Trash2, ShieldCheck,
  Activity, User, Settings, LogOut, Sun, Moon, ShieldAlert, Lock,
  Menu, X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useVaultStore } from '../store/vaultStore';
import { api } from '../services/api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/files', label: 'My Files', icon: Folder },
  { to: '/shared', label: 'Shared Files', icon: Share2 },
  { to: '/recent', label: 'Recent', icon: Clock },
  { to: '/recycle-bin', label: 'Recycle Bin', icon: Trash2 },
  { to: '/security', label: 'Security', icon: ShieldCheck },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { theme, toggleTheme } = useUiStore();
  const unlocked = useVaultStore((s) => s.unlocked);
  const expiresAt = useVaultStore((s) => s.expiresAt);
  const markLocked = useVaultStore((s) => s.markLocked);
  const setVaultEnabled = useVaultStore((s) => s.setVaultEnabled);
  const [remaining, setRemaining] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync vault-enabled flag from the server on load (e.g. after a page
  // refresh, where the in-memory zustand store has been reset).
  useEffect(() => {
    api.get('/vault/status').then((res) => setVaultEnabled(res.data.data.vaultEnabled)).catch(() => undefined);
  }, [setVaultEnabled]);

  // Client-side-only countdown - a UI convenience, not the source of
  // truth. The server independently expires the actual vault session
  // cookie regardless of what this timer shows.
  useEffect(() => {
    if (!unlocked || !expiresAt) { setRemaining(''); return; }
    const tick = () => {
      const ms = expiresAt - Date.now();
      if (ms <= 0) { markLocked(); setRemaining(''); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [unlocked, expiresAt, markLocked]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => undefined);
    clearAuth();
    navigate('/login');
  }

  async function handleLockVault() {
    await api.post('/vault/lock').catch(() => undefined);
    markLocked();
  }

  function renderNavItems(onClick?: () => void) {
    return (
      <>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClick}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
        {(user?.role === 'ADMIN' || user?.role === 'MODERATOR') && (
          <NavLink
            to="/admin"
            onClick={onClick}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`
            }
          >
            <ShieldAlert className="h-4 w-4" />
            Admin
          </NavLink>
        )}
      </>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <ShieldCheck className="h-6 w-6 text-brand-600" />
          <span className="text-lg font-semibold text-gray-900 dark:text-white">SecureVault</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">{renderNavItems()}</nav>
        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-30 bg-gray-900/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-gray-200 bg-white shadow-xl transition-transform duration-200 ease-in-out dark:border-gray-800 dark:bg-gray-900 md:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-brand-600" />
            <span className="text-lg font-semibold text-gray-900 dark:text-white">SecureVault</span>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1 p-3">{renderNavItems(() => setMobileMenuOpen(false))}</nav>
        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-sm text-gray-500">
              Signed in as <span className="font-medium text-gray-800 dark:text-gray-200">{user?.username}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {unlocked && remaining && (
              <button
                onClick={handleLockVault}
                title="Click to lock the vault now"
                className="hidden items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 sm:flex"
              >
                <Lock className="h-3.5 w-3.5" /> Vault unlocked - locks in {remaining}
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
