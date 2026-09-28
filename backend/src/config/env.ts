import dotenv from 'dotenv';
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PROD = NODE_ENV === 'production';

export const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT ?? '4000', 10),

  DATABASE_URL: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/secure_storage'),

  JWT_SECRET: required('JWT_SECRET', 'dev-only-access-secret-change-me'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET', 'dev-only-refresh-secret-change-me'),
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY ?? '15m',
  JWT_REFRESH_EXPIRY_DAYS: parseInt(process.env.JWT_REFRESH_EXPIRY_DAYS ?? '7', 10),

  /**
   * Signs the short-lived "vault session" token issued by POST
   * /vault/unlock. Deliberately a SEPARATE secret from JWT_SECRET so
   * that the normal auth token and the vault-unlock token are two
   * independently revocable/rotatable credentials - compromising one
   * secret should not compromise the other.
   */
  VAULT_SESSION_SECRET: required('VAULT_SESSION_SECRET', 'dev-only-vault-session-secret-change-me'),
  VAULT_SESSION_EXPIRY: process.env.VAULT_SESSION_EXPIRY ?? '15m',
  VAULT_UNLOCK_RATE_LIMIT_MAX: parseInt(process.env.VAULT_UNLOCK_RATE_LIMIT_MAX ?? (IS_PROD ? '10' : '100'), 10),

  /**
   * Refresh-token cookie flags.
   *
   * A `Secure` cookie is silently dropped by the browser over plain HTTP,
   * which would make "stay logged in after a refresh" fail on any
   * non-HTTPS deployment (including the default docker-compose setup on
   * http://localhost:8080). So it defaults to on in production but can be
   * turned off explicitly for an HTTP demo.
   */
  COOKIE_SECURE: (process.env.COOKIE_SECURE ?? String(IS_PROD)) === 'true',
  COOKIE_SAMESITE: (process.env.COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none',

  /** Hops of reverse proxy to trust for req.ip (nginx = 1). 0 disables. */
  TRUST_PROXY: parseInt(process.env.TRUST_PROXY ?? (IS_PROD ? '1' : '0'), 10),

  /** Requests per 15 min. Kept high in development so testing doesn't lock you out. */
  API_RATE_LIMIT_MAX: parseInt(process.env.API_RATE_LIMIT_MAX ?? '300', 10),
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? (IS_PROD ? '10' : '100'), 10),

  /**
   * When true, a user must click the emailed verification link before
   * they can sign in. Off by default so the project can be demonstrated
   * without a real SMTP provider.
   */
  REQUIRE_EMAIL_VERIFICATION: (process.env.REQUIRE_EMAIL_VERIFICATION ?? 'false') === 'true',

  // RSA keypair used to protect (wrap) each file's AES key.
  // In production these should come from a KMS/secrets manager, not the filesystem.
  RSA_PUBLIC_KEY_PATH: process.env.RSA_PUBLIC_KEY_PATH ?? 'rsa_public.pem',
  RSA_PRIVATE_KEY_PATH: process.env.RSA_PRIVATE_KEY_PATH ?? 'rsa_private.pem',
  RSA_PUBLIC_KEY: process.env.RSA_PUBLIC_KEY ?? '',
  RSA_PRIVATE_KEY: process.env.RSA_PRIVATE_KEY ?? '',
  RSA_KEY_ID: process.env.RSA_KEY_ID ?? 'rsa-key-1',

  // Storage: "local" (default, for running without AWS) or "s3"
  STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? 'local',
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH ?? './storage',

  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET ?? '',
  /**
   * Optional custom endpoint, for S3-COMPATIBLE providers other than
   * AWS itself - e.g. Cloudflare R2 or Backblaze B2, both of which
   * offer a genuinely free tier with no time limit (unlike AWS's
   * 12-month free trial), and both speak the same S3 API our existing
   * S3StorageAdapter already uses. Leave unset for real AWS S3.
   */
  AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT || undefined,
  // R2/B2 require "path style" bucket addressing (bucket.name/in/path
  // rather than bucket-name.s3.amazonaws.com/path); real AWS S3 does
  // not need this, hence defaulting to true only when a custom
  // endpoint is actually set.
  AWS_S3_FORCE_PATH_STYLE: (process.env.AWS_S3_FORCE_PATH_STYLE ?? (process.env.AWS_S3_ENDPOINT ? 'true' : 'false')) === 'true',

  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT ?? '587', 10),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD ?? '',
  EMAIL_DEV_MODE: (process.env.EMAIL_DEV_MODE ?? 'true') === 'true',

  MAX_FILE_SIZE_BYTES: parseInt(process.env.MAX_FILE_SIZE_BYTES ?? String(200 * 1024 * 1024), 10), // 200MB

  RECYCLE_BIN_RETENTION_DAYS: parseInt(process.env.RECYCLE_BIN_RETENTION_DAYS ?? '30', 10),

  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
};
