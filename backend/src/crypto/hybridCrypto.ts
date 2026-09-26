/**
 * hybridCrypto.ts
 * ------------------------------------------------------------------
 * Core hybrid cryptography module for the Secure Cloud File Storage
 * system.
 *
 *   1. Every file gets a fresh, random AES-256 key (never reused).
 *   2. The file bytes are encrypted with AES-256-GCM (authenticated
 *      encryption -> confidentiality + integrity + tamper detection).
 *   3. The AES key itself is "wrapped" (encrypted) using RSA-OAEP
 *      (SHA-256) with the system's RSA-2048 public key.
 *   4. Only the wrapped (encrypted) AES key is ever persisted. The
 *      raw AES key exists only in memory, for the duration of the
 *      encrypt/decrypt operation.
 *
 * This file intentionally contains ONLY cryptography. It has no
 * knowledge of the database, HTTP, or S3 - keeping the crypto
 * module isolated makes it independently testable and easy to
 * explain/defend on its own.
 * ------------------------------------------------------------------
 */

import crypto from 'crypto';

export const AES_KEY_LENGTH_BYTES = 32; // 256-bit key
export const AES_IV_LENGTH_BYTES = 12; // 96-bit IV, recommended for GCM
export const AES_AUTH_TAG_LENGTH_BYTES = 16;

export interface EncryptedFilePayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export interface WrappedKey {
  encryptedAesKeyB64: string;
  rsaKeyId: string;
}

/**
 * Generate a new, cryptographically random AES-256 key.
 * A fresh key MUST be generated per file upload - never reuse keys.
 */
export function generateAesKey(): Buffer {
  return crypto.randomBytes(AES_KEY_LENGTH_BYTES);
}

/**
 * Encrypt a file's contents with AES-256-GCM using the given key.
 * Returns ciphertext, the IV used, and the GCM authentication tag.
 */
export function encryptFileBuffer(plaintext: Buffer, aesKey: Buffer): EncryptedFilePayload {
  if (aesKey.length !== AES_KEY_LENGTH_BYTES) {
    throw new Error('Invalid AES key length: expected 256-bit (32 byte) key');
  }

  const iv = crypto.randomBytes(AES_IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { ciphertext, iv, authTag };
}

/**
 * Decrypt AES-256-GCM ciphertext. Throws if the authentication tag
 * does not match (i.e. the file was tampered with or the key/IV is
 * wrong) - this is what gives GCM mode its integrity guarantee.
 */
export function decryptFileBuffer(
  ciphertext: Buffer,
  aesKey: Buffer,
  iv: Buffer,
  authTag: Buffer
): Buffer {
  if (aesKey.length !== AES_KEY_LENGTH_BYTES) {
    throw new Error('Invalid AES key length: expected 256-bit (32 byte) key');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    // final() throws if the auth tag verification fails
    throw new Error('Decryption failed: authentication tag mismatch (file may be corrupted or tampered with)');
  }
}

/**
 * Wrap (encrypt) a raw AES key using RSA-OAEP with SHA-256, so it is
 * safe to persist in the database. This is the "hybrid" part of the
 * hybrid cryptography scheme: RSA is slow/limited on large data, so
 * it only ever protects the small AES key, not the file itself.
 */
export function wrapAesKey(aesKey: Buffer, rsaPublicKeyPem: string, rsaKeyId: string): WrappedKey {
  const encrypted = crypto.publicEncrypt(
    {
      key: rsaPublicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    aesKey
  );

  return {
    encryptedAesKeyB64: encrypted.toString('base64'),
    rsaKeyId,
  };
}

/**
 * Unwrap (decrypt) an AES key that was previously wrapped with
 * wrapAesKey(), using the corresponding RSA private key.
 */
export function unwrapAesKey(encryptedAesKeyB64: string, rsaPrivateKeyPem: string): Buffer {
  const encrypted = Buffer.from(encryptedAesKeyB64, 'base64');

  return crypto.privateDecrypt(
    {
      key: rsaPrivateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encrypted
  );
}

/**
 * Compute the SHA-256 hash of a buffer. Used as an additional,
 * independent integrity check on top of AES-GCM's authentication
 * tag - e.g. to let a client verify end-to-end integrity of the
 * original file after decryption.
 */
export function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a new RSA-2048 keypair (PEM encoded). Used by the
 * key-setup script; not called during normal request handling.
 */
export function generateRsaKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * High-level convenience wrapper: encrypt a plaintext file buffer
 * end-to-end (AES-256-GCM + RSA-OAEP key wrapping) in one call.
 * This is what the file upload service calls.
 */
export function hybridEncryptFile(
  plaintext: Buffer,
  rsaPublicKeyPem: string,
  rsaKeyId: string
): {
  ciphertext: Buffer;
  ivB64: string;
  authTagB64: string;
  encryptedAesKeyB64: string;
  rsaKeyId: string;
  sha256: string;
} {
  const aesKey = generateAesKey();
  const { ciphertext, iv, authTag } = encryptFileBuffer(plaintext, aesKey);
  const wrapped = wrapAesKey(aesKey, rsaPublicKeyPem, rsaKeyId);
  const sha256 = sha256Hex(plaintext);

  // Best-effort scrub of the raw key from the buffer reference.
  aesKey.fill(0);

  return {
    ciphertext,
    ivB64: iv.toString('base64'),
    authTagB64: authTag.toString('base64'),
    encryptedAesKeyB64: wrapped.encryptedAesKeyB64,
    rsaKeyId: wrapped.rsaKeyId,
    sha256,
  };
}

/**
 * High-level convenience wrapper: decrypt a stored file end-to-end.
 * This is what the file download service calls.
 */
export function hybridDecryptFile(
  ciphertext: Buffer,
  ivB64: string,
  authTagB64: string,
  encryptedAesKeyB64: string,
  rsaPrivateKeyPem: string,
  expectedSha256?: string
): Buffer {
  const aesKey = unwrapAesKey(encryptedAesKeyB64, rsaPrivateKeyPem);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const plaintext = decryptFileBuffer(ciphertext, aesKey, iv, authTag);
  aesKey.fill(0);

  if (expectedSha256) {
    const actual = sha256Hex(plaintext);
    if (actual !== expectedSha256) {
      throw new Error('Integrity check failed: SHA-256 hash mismatch after decryption');
    }
  }

  return plaintext;
}
