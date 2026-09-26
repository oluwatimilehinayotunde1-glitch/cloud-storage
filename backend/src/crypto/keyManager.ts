/**
 * keyManager.ts
 * ------------------------------------------------------------------
 * Loads (or, in development, generates) the RSA-2048 keypair used to
 * wrap/unwrap per-file AES keys.
 *
 * In production, replace this with a real KMS / secrets manager
 * integration (AWS KMS, HashiCorp Vault, etc.) - storing the RSA
 * private key on local disk is only acceptable for local development
 * and this academic project's demonstration environment.
 * ------------------------------------------------------------------
 */

import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { generateRsaKeyPair } from './hybridCrypto';

let cachedPublicKey: string | null = null;
let cachedPrivateKey: string | null = null;

function ensureKeysExist(): void {
  const pubPath = path.resolve(env.RSA_PUBLIC_KEY_PATH);
  const privPath = path.resolve(env.RSA_PRIVATE_KEY_PATH);

  if (fs.existsSync(pubPath) && fs.existsSync(privPath)) {
    return;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      `RSA keypair not found at ${pubPath} / ${privPath}. ` +
        'Generate a production keypair and mount it as a secret before starting the server.'
    );
  }

  // Development convenience: auto-generate a local keypair.
  const { publicKey, privateKey } = generateRsaKeyPair();
  fs.mkdirSync(path.dirname(pubPath), { recursive: true });
  fs.mkdirSync(path.dirname(privPath), { recursive: true });
  fs.writeFileSync(pubPath, publicKey, { mode: 0o644 });
  fs.writeFileSync(privPath, privateKey, { mode: 0o600 });

  // eslint-disable-next-line no-console
  console.warn(
    `[keyManager] Generated a new development RSA-2048 keypair at ${pubPath} / ${privPath}. ` +
      'Do NOT use this auto-generated keypair in production.'
  );
}

export function getRsaPublicKey(): string {
  if (cachedPublicKey) return cachedPublicKey;
  ensureKeysExist();
  cachedPublicKey = fs.readFileSync(path.resolve(env.RSA_PUBLIC_KEY_PATH), 'utf-8');
  return cachedPublicKey;
}

export function getRsaPrivateKey(): string {
  if (cachedPrivateKey) return cachedPrivateKey;
  ensureKeysExist();
  cachedPrivateKey = fs.readFileSync(path.resolve(env.RSA_PRIVATE_KEY_PATH), 'utf-8');
  return cachedPrivateKey;
}

export function getRsaKeyId(): string {
  return env.RSA_KEY_ID;
}
