import { useEffect, useState } from 'react';
import { Lock, ShieldCheck, KeyRound, Copy, Check, X } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api';
import { Button, Input } from './ui';
import { useVaultStore } from '../store/vaultStore';

type Mode = 'unlock' | 'setup' | 'recovery';

interface VaultModalProps {
  /** Which flow to open into.
   *  - 'unlock': enter vault password to unlock the session (default)
   *  - 'setup': first-time vault password + one-time recovery code display
   *  - 'recovery': enter recovery code -> unlocks + forces a password reset
   *  - 'change': like 'setup', but calls reset-password (requires an
   *    already-valid vault session, of either kind) instead of first-time
   *    setup - used for a deliberate "change vault password" action
   *  - 'regenerate': skips all forms and immediately requests a new
   *    recovery code, then shows the one-time reveal screen
   */
  initialMode?: Mode | 'change' | 'regenerate';
  onClose: () => void;
  /** Called after a successful unlock/setup, so the caller can retry
   *  whatever action (e.g. a download) triggered the modal. */
  onUnlocked?: () => void;
}

/**
 * Single modal covering all three vault flows:
 *  - unlock:   enter vault password -> unlocks the session
 *  - setup:    first-time vault password + one-time recovery code display
 *  - recovery: enter recovery code -> unlocks + forces a password reset
 *
 * This is intentionally one component (not three pages) so it can be
 * opened as an interrupt from anywhere a locked download is clicked,
 * without navigating away from what the user was doing.
 */
export default function VaultModal({ initialMode = 'unlock', onClose, onUnlocked }: VaultModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode === 'change' || initialMode === 'regenerate' ? 'setup' : initialMode);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revealedRecoveryCode, setRevealedRecoveryCode] = useState<string | null>(null);
  const [recoverySavedConfirmed, setRecoverySavedConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  // True once the user has verified a recovery code in THIS modal session
  // and is now setting a replacement password - changes which endpoint
  // the setup form submits to (reset-password vs first-time setup).
  const [resetAfterRecovery, setResetAfterRecovery] = useState(initialMode === 'change');
  const [regenerating, setRegenerating] = useState(initialMode === 'regenerate');

  const markUnlocked = useVaultStore((s) => s.markUnlocked);
  const setVaultEnabled = useVaultStore((s) => s.setVaultEnabled);

  async function handleRegenerate() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/vault/recovery/regenerate');
      setRevealedRecoveryCode(res.data.data.recoveryCode);
    } catch (err) {
      fail(apiErrorMessage(err));
      setRegenerating(false);
    } finally {
      setLoading(false);
    }
  }

  // Kick off the regenerate call once, on open.
  useEffect(() => {
    if (initialMode === 'regenerate') handleRegenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fail(message: string) {
    setError(message);
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/vault/unlock', { vaultPassword: password });
      markUnlocked();
      // Deliberately does NOT call onClose() itself: the caller's
      // onUnlocked decides whether to close the modal outright (most
      // callers) or transition it into a follow-up step (e.g.
      // SecurityPage chaining "unlock" straight into "change password").
      onUnlocked?.();
    } catch (err) {
      fail(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) return fail('Passwords do not match');
    setLoading(true);
    try {
      if (resetAfterRecovery) {
        // Already have a valid (recovery-sourced) vault session at this
        // point, which is what /vault/reset-password requires. It
        // deliberately clears that session server-side once done, so
        // we immediately re-unlock with the just-set password rather
        // than leaving the user stuck on a "locked" state right after
        // proving who they are.
        await api.post('/vault/reset-password', { newVaultPassword: password, confirmVaultPassword: confirmPassword });
        await api.post('/vault/unlock', { vaultPassword: password });
        markUnlocked();
        onUnlocked?.();
      } else {
        const res = await api.post('/vault/setup', { vaultPassword: password, confirmVaultPassword: confirmPassword });
        setRevealedRecoveryCode(res.data.data.recoveryCode);
        setVaultEnabled(true);
        markUnlocked();
      }
    } catch (err) {
      fail(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/vault/unlock/recovery', { recoveryCode });
      markUnlocked();
      // Force an immediate password reset - the recovery code path
      // intentionally does not leave the user just "unlocked as normal",
      // since the whole point was that they lost their password.
      setResetAfterRecovery(true);
      setMode('setup');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      fail(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function copyRecoveryCode() {
    if (!revealedRecoveryCode) return;
    await navigator.clipboard.writeText(revealedRecoveryCode).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900 ${
          shake ? 'animate-[shake_0.4s_ease-in-out]' : ''
        }`}
      >
        <style>{`@keyframes shake { 10%,90%{transform:translateX(-1px)} 20%,80%{transform:translateX(2px)} 30%,50%,70%{transform:translateX(-4px)} 40%,60%{transform:translateX(4px)} }`}</style>

        {!revealedRecoveryCode && !regenerating && (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              {mode === 'unlock' && <Lock className="h-5 w-5 text-brand-600" />}
              {mode === 'setup' && <ShieldCheck className="h-5 w-5 text-brand-600" />}
              {mode === 'recovery' && <KeyRound className="h-5 w-5 text-brand-600" />}
              <h2 className="text-base font-semibold">
                {mode === 'unlock' && 'Unlock your vault'}
                {mode === 'setup' && 'Set up Vault Mode'}
                {mode === 'recovery' && 'Use your recovery code'}
              </h2>
            </div>
            <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ---- One-time recovery code reveal (after setup or regenerate) ---- */}
        {regenerating && !revealedRecoveryCode ? (
          <div className="space-y-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {error ? (
              <>
                <p className="text-red-600">{error}</p>
                <Button variant="secondary" onClick={onClose}>Close</Button>
              </>
            ) : (
              'Generating a new recovery code...'
            )}
          </div>
        ) : revealedRecoveryCode ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Save this recovery code somewhere safe. It's the <strong>only</strong> way back into your
              vault-protected files if you forget your vault password, and it will not be shown again.
            </p>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-brand-400 bg-brand-50 px-3 py-3 font-mono text-sm text-brand-800 dark:bg-brand-900/20 dark:text-brand-200">
              <span className="break-all">{revealedRecoveryCode}</span>
              <button onClick={copyRecoveryCode} className="shrink-0 rounded p-1 hover:bg-brand-100 dark:hover:bg-brand-900/40">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={recoverySavedConfirmed}
                onChange={(e) => setRecoverySavedConfirmed(e.target.checked)}
                className="mt-1"
              />
              I have saved this recovery code somewhere safe.
            </label>
            <Button className="w-full" disabled={!recoverySavedConfirmed} onClick={() => { onUnlocked?.(); onClose(); }}>
              Done
            </Button>
          </div>
        ) : mode === 'unlock' ? (
          <form onSubmit={handleUnlock} className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This file is vault-protected. Enter your vault password to unlock downloads for this session.
            </p>
            <Input
              label="Vault password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Unlocking...' : 'Unlock vault'}
            </Button>
            <button
              type="button"
              onClick={() => { setMode('recovery'); setError(null); }}
              className="w-full text-center text-xs text-gray-500 hover:underline dark:text-gray-400"
            >
              Forgot your vault password? Use recovery code
            </button>
          </form>
        ) : mode === 'recovery' ? (
          <form onSubmit={handleRecovery} className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your recovery code. This is a separate, alternate path from your vault password - using it
              will require you to set a new vault password right after.
            </p>
            <Input
              label="Recovery code"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              autoFocus
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Verifying...' : 'Use recovery code'}
            </Button>
            <button
              type="button"
              onClick={() => { setMode('unlock'); setError(null); }}
              className="w-full text-center text-xs text-gray-500 hover:underline dark:text-gray-400"
            >
              Back to password unlock
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetup} className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {resetAfterRecovery
                ? 'Set a new vault password to replace the one you forgot.'
                : "This is separate from your account login password. You'll need it (or your recovery code) to download vault-protected files."}
            </p>
            <Input label="Vault password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Input label="Confirm vault password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Set vault password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
