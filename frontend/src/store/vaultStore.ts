import { create } from 'zustand';

// Mirrors env.VAULT_SESSION_EXPIRY's default on the backend. Purely a
// client-side hint for the "locks again in mm:ss" indicator - it does
// NOT grant access to anything. The real expiry lives in the signed
// vault-session cookie and is enforced by middleware/vaultAuth.ts on
// every request regardless of what this store thinks.
const VAULT_SESSION_MS = 15 * 60 * 1000;

interface VaultState {
  /** True once the user has successfully unlocked the vault this session. */
  unlocked: boolean;
  /** Client-side-only estimate of when the server-side session expires. */
  expiresAt: number | null;
  vaultEnabled: boolean;
  markUnlocked: () => void;
  markLocked: () => void;
  setVaultEnabled: (enabled: boolean) => void;
  /** True if the estimated expiry has passed - used to proactively re-lock the UI. */
  isExpired: () => boolean;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  unlocked: false,
  expiresAt: null,
  vaultEnabled: false,
  markUnlocked: () => set({ unlocked: true, expiresAt: Date.now() + VAULT_SESSION_MS }),
  markLocked: () => set({ unlocked: false, expiresAt: null }),
  setVaultEnabled: (enabled) => set({ vaultEnabled: enabled }),
  isExpired: () => {
    const { expiresAt } = get();
    return expiresAt !== null && Date.now() >= expiresAt;
  },
}));
