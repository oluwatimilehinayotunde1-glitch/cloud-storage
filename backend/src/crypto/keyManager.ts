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

function normalizePem(value?: string): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const normalized = value.replace(/\\n/g, '\n').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveKeyPath(configuredPath: string | undefined, defaultFilename: string) {
  const basename = path.basename(configuredPath || defaultFilename);
  const candidates: string[] = [];

  if (configuredPath && configuredPath.trim()) {
    candidates.push(path.resolve(configuredPath));
  }

  candidates.push(path.resolve('/etc/secrets', basename));
  candidates.push(path.resolve('/app/keys', basename));
  candidates.push(path.resolve(process.cwd(), 'keys', basename));
  candidates.push(path.resolve(process.cwd(), basename));

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (fs.existsSync(candidate)) {
      return { resolvedPath: candidate, checkedPaths: uniqueCandidates };
    }
  }

  return { resolvedPath: undefined, checkedPaths: uniqueCandidates };
}

export function ensureKeysLoaded(): { publicKey: string; privateKey: string } {
  const publicLookup = resolveKeyPath(env.RSA_PUBLIC_KEY_PATH, 'rsa_public.pem');
  const privateLookup = resolveKeyPath(env.RSA_PRIVATE_KEY_PATH, 'rsa_private.pem');

  const publicKeyFromFile = publicLookup.resolvedPath ? fs.readFileSync(publicLookup.resolvedPath, 'utf-8').trim() : undefined;
  const privateKeyFromFile = privateLookup.resolvedPath ? fs.readFileSync(privateLookup.resolvedPath, 'utf-8').trim() : undefined;

  const publicKeyFromEnv = normalizePem(env.RSA_PUBLIC_KEY || process.env.RSA_PUBLIC_KEY);
  const privateKeyFromEnv = normalizePem(env.RSA_PRIVATE_KEY || process.env.RSA_PRIVATE_KEY);

  const publicKey = publicKeyFromFile ?? publicKeyFromEnv;
  const privateKey = privateKeyFromFile ?? privateKeyFromEnv;

  if (publicKey && privateKey) {
    cachedPublicKey = publicKey;
    cachedPrivateKey = privateKey;
    return { publicKey, privateKey };
  }

  if (env.NODE_ENV !== 'production') {
    const { publicKey: generatedPublicKey, privateKey: generatedPrivateKey } = generateRsaKeyPair();
    const devPublicPath = path.resolve(process.cwd(), 'keys', 'rsa_public.pem');
    const devPrivatePath = path.resolve(process.cwd(), 'keys', 'rsa_private.pem');

    fs.mkdirSync(path.dirname(devPublicPath), { recursive: true });
    fs.mkdirSync(path.dirname(devPrivatePath), { recursive: true });
    fs.writeFileSync(devPublicPath, generatedPublicKey, { mode: 0o644 });
    fs.writeFileSync(devPrivatePath, generatedPrivateKey, { mode: 0o600 });

    cachedPublicKey = generatedPublicKey;
    cachedPrivateKey = generatedPrivateKey;

    // eslint-disable-next-line no-console
    console.warn(
      `[keyManager] Generated a new development RSA-2048 keypair at ${devPublicPath} / ${devPrivatePath}. ` +
        'Do NOT use this auto-generated keypair in production.'
    );

    return { publicKey: generatedPublicKey, privateKey: generatedPrivateKey };
  }

  const checkedPaths = [
    ...publicLookup.checkedPaths.map((candidate) => `RSA_PUBLIC_KEY_PATH checked: ${candidate}`),
    ...privateLookup.checkedPaths.map((candidate) => `RSA_PRIVATE_KEY_PATH checked: ${candidate}`),
    publicKeyFromEnv ? 'RSA_PUBLIC_KEY found in environment variable' : 'RSA_PUBLIC_KEY not set',
    privateKeyFromEnv ? 'RSA_PRIVATE_KEY found in environment variable' : 'RSA_PRIVATE_KEY not set',
  ];

  throw new Error(
    `RSA keypair not found. Checked paths: ${checkedPaths.join('; ')}. ` +
      'Set RSA_PUBLIC_KEY_PATH / RSA_PRIVATE_KEY_PATH, mount the files at /etc/secrets/<filename>, or set RSA_PUBLIC_KEY / RSA_PRIVATE_KEY with PEM contents.'
  );
}

export function getRsaPublicKey(): string {
  if (cachedPublicKey) return cachedPublicKey;
  return ensureKeysLoaded().publicKey;
}

export function getRsaPrivateKey(): string {
  if (cachedPrivateKey) return cachedPrivateKey;
  return ensureKeysLoaded().privateKey;
}

export function getRsaKeyId(): string {
  return env.RSA_KEY_ID;
}
