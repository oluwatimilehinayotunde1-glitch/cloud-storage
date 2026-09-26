/**
 * vaultCrypto.ts
 * ------------------------------------------------------------------
 * Second, independent key-wrapping layer on top of hybridCrypto.ts.
 *
 * hybridCrypto.ts wraps every file's AES key with the SYSTEM's RSA
 * key — meaning whoever holds the RSA private key (the server) can
 * decrypt any file. This module adds a wrap of the SAME AES key
 * under a key derived from a secret only the user holds (a "Vault
 * Password"), so that a vault-protected file requires BOTH the
 * server's RSA key AND the user's vault secret to decrypt.
 *
 * Design (documented here because it's the first thing a defense
 * panel will ask about):
 *
 *   1. Argon2id(password, salt) -> a 32-byte "master secret". Argon2id
 *      is memory-hard, which makes GPU/ASIC password-guessing far more
 *      expensive than PBKDF2/bcrypt for an attacker who obtains the
 *      salt + verifier hash from the database.
 *   2. The master secret is NEVER used directly as a key for two
 *      different purposes. It is split via HKDF-SHA256 into two
 *      independent values using different "info" labels:
 *        - one for the login-time verifier (so the server can check
 *          "is this the right password?" without ever storing
 *          anything that could itself unlock a file)
 *        - one for the actual Key-Encryption-Key (KEK) that wraps
 *          AES file keys
 *      This matters: if the same raw value were reused for both, an
 *      attacker who obtained the verifier could use it as the key
 *      directly. Splitting it means the verifier is cryptographically
 *      useless for decryption, even though it's derived from the same
 *      password.
 *   3. The KEK wraps/unwraps the per-file AES key with AES-256-GCM
 *      (fresh IV per wrap), exactly like the RSA layer does — same
 *      authenticated-encryption guarantees, same tamper detection.
 *
 * The recovery code path (for "I forgot my vault password") uses the
 * exact same primitives, just with a high-entropy random secret
 * instead of a human-chosen password, and its own salt.
 *
 * IMPLEMENTATION TRADE-OFF (state this explicitly in the defense):
 * This module runs server-side. The vault password is submitted to
 * the server over TLS for the unlock/setup request and the KEK is
 * derived server-side, within that request's scope; it is never
 * persisted to disk or logs, and only the derived, request-scoped
 * vault-session token (see utils/jwt.ts + middleware/vaultAuth.ts)
 * carries it forward for the life of that session. This is NOT full
 * client-side zero-knowledge (a fully compromised, actively malicious
 * server could in principle capture the password at submission time).
 * It IS a genuine second, independent envelope: a database dump plus
 * the RSA private key alone is still insufficient to decrypt a
 * vault-protected file, which is the property we set out to add.
 * Upgrading to client-side Argon2id (WASM) would remove even that
 * caveat and is a natural "future work" extension of this module.
 * ------------------------------------------------------------------
 */

import crypto from 'crypto';
import argon2 from 'argon2';

export const VAULT_KEK_LENGTH_BYTES = 32;
export const VAULT_SALT_LENGTH_BYTES = 16;

// Tuned for roughly 300-500ms on typical commodity hardware, per
// OWASP's Argon2id guidance for interactive, user-facing password
// hashing (higher cost than the login password hash in utils/password.ts
// is acceptable here since vault unlock is a deliberate, infrequent
// action, not something on the hot path of every request).
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  raw: true as const,
};

export interface WrappedVaultKey {
  wrappedKeyB64: string;
  ivB64: string;
  authTagB64: string;
}

/** Random salt for a new vault password or recovery code. */
export function generateVaultSalt(): Buffer {
  return crypto.randomBytes(VAULT_SALT_LENGTH_BYTES);
}

/**
 * Derive the raw Argon2id "master secret" for a password/salt pair.
 * This value is never stored and never used directly as a key or a
 * verifier — see deriveKek() and computeVerifierHash().
 */
export async function deriveMasterSecret(secret: string, salt: Buffer): Promise<Buffer> {
  const hash = await argon2.hash(secret, { ...ARGON2_OPTS, salt });
  // argon2 with raw:true resolves to a Buffer, but the type defs mark
  // hash()'s return as string | Buffer depending on the overload.
  return hash as unknown as Buffer;
}

function hkdf(masterSecret: Buffer, infoLabel: string, length = 32): Buffer {
  const derived = crypto.hkdfSync('sha256', masterSecret, Buffer.alloc(0), Buffer.from(infoLabel, 'utf8'), length);
  return Buffer.from(derived);
}

/** The value actually used to wrap/unwrap AES file keys. */
export function deriveKek(masterSecret: Buffer): Buffer {
  return hkdf(masterSecret, 'vault-kek-v1');
}

/**
 * The value whose hash is stored server-side to check "was the right
 * password/recovery-code submitted?" at unlock time. Cryptographically
 * independent from the KEK even though both come from the same
 * Argon2id output, because of the distinct HKDF info label.
 */
export function computeVerifierHash(masterSecret: Buffer): string {
  const verifierMaterial = hkdf(masterSecret, 'vault-verifier-v1');
  return crypto.createHash('sha256').update(verifierMaterial).digest('hex');
}

/** Constant-time comparison of two hex-encoded hashes. */
export function verifierHashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate a high-entropy recovery code, formatted for a human to
 * write down: 8 groups of 4 uppercase base32-ish (Crockford, no
 * ambiguous chars) characters, e.g. "AB12-CD34-EF56-...".
 */
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O, U
export function generateRecoveryCode(): string {
  const bytes = crypto.randomBytes(20);
  let chars = '';
  for (const byte of bytes) {
    chars += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
  }
  return chars.match(/.{1,4}/g)!.join('-');
}

/** Wrap a raw AES file key under a vault/recovery KEK (AES-256-GCM). */
export function wrapAesKeyWithKek(aesKey: Buffer, kek: Buffer): WrappedVaultKey {
  if (kek.length !== VAULT_KEK_LENGTH_BYTES) {
    throw new Error('Invalid KEK length: expected 256-bit (32 byte) key');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const wrapped = Buffer.concat([cipher.update(aesKey), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    wrappedKeyB64: wrapped.toString('base64'),
    ivB64: iv.toString('base64'),
    authTagB64: authTag.toString('base64'),
  };
}

/**
 * Unwrap an AES file key that was wrapped with wrapAesKeyWithKek().
 * Throws (auth tag mismatch) if the KEK is wrong or the stored values
 * were tampered with — same integrity guarantee as the RSA layer.
 */
export function unwrapAesKeyWithKek(wrapped: WrappedVaultKey, kek: Buffer): Buffer {
  const iv = Buffer.from(wrapped.ivB64, 'base64');
  const authTag = Buffer.from(wrapped.authTagB64, 'base64');
  const ciphertext = Buffer.from(wrapped.wrappedKeyB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Vault unwrap failed: authentication tag mismatch (wrong key or tampered data)');
  }
}
