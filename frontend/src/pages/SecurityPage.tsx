import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useVaultStore } from '../store/vaultStore';
import { Button, Card, Input } from '../components/ui';
import VaultModal from '../components/VaultModal';

interface SessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

export default function SecurityPage() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  // 2FA
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [twoFaMessage, setTwoFaMessage] = useState<string | null>(null);
  const [disablePassword, setDisablePassword] = useState('');

  // Sessions
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  // Vault Mode
  const [vaultStatus, setVaultStatus] = useState<{
    vaultEnabled: boolean; protectedFileCount: number; unprotectedFileCount: number;
  } | null>(null);
  const [vaultModalMode, setVaultModalMode] = useState<'setup' | 'unlock' | 'change' | 'regenerate' | null>(null);
  const [pendingVaultAction, setPendingVaultAction] = useState<'change' | 'protect' | 'regenerate' | null>(null);
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
  const unlocked = useVaultStore((s) => s.unlocked);
  const setVaultEnabledInStore = useVaultStore((s) => s.setVaultEnabled);

  async function loadVaultStatus() {
    const res = await api.get('/vault/status');
    setVaultStatus(res.data.data);
    setVaultEnabledInStore(res.data.data.vaultEnabled);
  }

  useEffect(() => { loadVaultStatus(); }, []);

  /** Change-password and protect-existing both require an active vault
   *  session first; if the vault is currently locked, prompt for the
   *  password before running the requested action. */
  function runVaultAction(action: 'change' | 'protect' | 'regenerate') {
    setVaultMessage(null);
    if (!unlocked) {
      setPendingVaultAction(action);
      setVaultModalMode('unlock');
      return;
    }
    if (action === 'change') setVaultModalMode('change');
    else if (action === 'regenerate') setVaultModalMode('regenerate');
    else handleProtectExisting();
  }

  async function handleProtectExisting() {
    const recoveryCode = prompt(
      'Enter your vault recovery code to confirm (existing files are also protected under it, so it stays valid for them):'
    );
    if (!recoveryCode) return;
    try {
      const res = await api.post('/vault/protect-existing', { recoveryCode });
      setVaultMessage(`${res.data.data.protectedCount} file(s) are now vault-protected.`);
      loadVaultStatus();
    } catch (err) {
      setVaultMessage(apiErrorMessage(err));
    }
  }

  async function loadSessions() {
    const res = await api.get('/auth/sessions');
    setSessions(res.data.data.sessions);
  }

  useEffect(() => { loadSessions(); }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwMessage(null);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword, confirmPassword });
      setPwMessage('Password changed successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPwError(apiErrorMessage(err));
    }
  }

  async function startTotpSetup() {
    const res = await api.post('/auth/2fa/setup');
    setQrCode(res.data.data.qrCodeDataUrl);
  }

  async function confirmTotp(e: React.FormEvent) {
    e.preventDefault();
    setTwoFaMessage(null);
    try {
      await api.post('/auth/2fa/confirm', { code: totpCode });
      setTwoFaMessage('Two-factor authentication enabled!');
      setQrCode(null);
      if (user && accessToken) setAuth(accessToken, { ...user, totpEnabled: true });
    } catch (err) {
      setTwoFaMessage(apiErrorMessage(err));
    }
  }

  async function disableTotp(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/auth/2fa/disable', { password: disablePassword });
      setTwoFaMessage('Two-factor authentication disabled.');
      setDisablePassword('');
      if (user && accessToken) setAuth(accessToken, { ...user, totpEnabled: false });
    } catch (err) {
      setTwoFaMessage(apiErrorMessage(err));
    }
  }

  async function revokeSession(id: string) {
    await api.delete(`/auth/sessions/${id}`);
    loadSessions();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Security Settings</h1>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Change password</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <Input label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwMessage && <p className="text-sm text-green-600">{pwMessage}</p>}
          <Button type="submit">Update password</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Two-factor authentication (TOTP)</h2>
        <p className="mb-4 text-sm text-gray-500">
          Status: <span className={user?.totpEnabled ? 'font-medium text-green-600' : 'font-medium text-gray-500'}>{user?.totpEnabled ? 'Enabled' : 'Disabled'}</span>
        </p>

        {!user?.totpEnabled ? (
          <>
            {!qrCode ? (
              <Button variant="secondary" onClick={startTotpSetup}>Set up 2FA</Button>
            ) : (
              <form onSubmit={confirmTotp} className="space-y-3">
                <img src={qrCode} alt="TOTP QR code" className="h-40 w-40 rounded border border-gray-200" />
                <Input label="Enter code from your app" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} maxLength={6} required />
                <Button type="submit">Confirm & enable</Button>
              </form>
            )}
          </>
        ) : (
          <form onSubmit={disableTotp} className="space-y-3">
            <Input label="Confirm password to disable 2FA" type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} required />
            <Button variant="danger" type="submit">Disable 2FA</Button>
          </form>
        )}
        {twoFaMessage && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{twoFaMessage}</p>}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Vault Mode</h2>
        <p className="mb-4 text-sm text-gray-500">
          An extra, independent password required to download your files - see the project README for how this
          combines with the underlying RSA+AES hybrid encryption.
        </p>

        {!vaultStatus ? null : !vaultStatus.vaultEnabled ? (
          <Button variant="secondary" onClick={() => setVaultModalMode('setup')}>Set up Vault Mode</Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Status: <span className="font-medium text-green-600">Enabled</span>
              {unlocked && <span className="ml-2 text-xs text-green-600">(unlocked this session)</span>}
            </p>
            <p className="text-xs text-gray-400">
              {vaultStatus.protectedFileCount} vault-protected file(s), {vaultStatus.unprotectedFileCount} not yet protected
            </p>
            <div className="flex flex-wrap gap-2">
              {vaultStatus.unprotectedFileCount > 0 && (
                <Button variant="secondary" onClick={() => runVaultAction('protect')}>Protect existing files</Button>
              )}
              <Button variant="secondary" onClick={() => runVaultAction('change')}>Change vault password</Button>
              <Button variant="secondary" onClick={() => runVaultAction('regenerate')}>Regenerate recovery code</Button>
            </div>
          </div>
        )}
        {vaultMessage && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{vaultMessage}</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Active sessions</h2>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="text-gray-800 dark:text-gray-200">{s.userAgent ?? 'Unknown device'}</p>
                <p className="text-xs text-gray-400">{s.ipAddress} · signed in {new Date(s.createdAt).toLocaleString()}</p>
              </div>
              <Button variant="ghost" onClick={() => revokeSession(s.id)}>Revoke</Button>
            </li>
          ))}
        </ul>
      </Card>

      {vaultModalMode && (
        <VaultModal
          initialMode={vaultModalMode}
          onClose={() => { setVaultModalMode(null); setPendingVaultAction(null); }}
          onUnlocked={() => {
            setVaultModalMode(null);
            loadVaultStatus();
            const action = pendingVaultAction;
            setPendingVaultAction(null);
            // If we opened the 'unlock' modal only as a prerequisite for
            // "change password" or "protect existing files", continue
            // into that action now that the vault session exists.
            if (action === 'change') setVaultModalMode('change');
            else if (action === 'protect') handleProtectExisting();
            else if (action === 'regenerate') setVaultModalMode('regenerate');
          }}
        />
      )}
    </div>
  );
}
