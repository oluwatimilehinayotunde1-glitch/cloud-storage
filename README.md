# SecureVault — Secure Cloud File Storage Using Hybrid Cryptography

A final-year project demonstrating a production-style cloud file storage system (à la Google Drive / Dropbox) where **every file is encrypted before it ever leaves the server**, using a hybrid cryptography scheme: **AES-256-GCM** for file contents and **RSA-2048 OAEP (SHA-256)** to protect each file's AES key.

---

## 1. Features

- Email/username + password authentication (Argon2id hashing), JWT access tokens + rotating refresh tokens, optional TOTP 2FA
- Email verification and password reset flows (dev-mode email logging, no SMTP required to test locally)
- **Hybrid cryptography**: a fresh random AES-256 key per file, AES-256-GCM encryption (authenticated), the AES key wrapped with RSA-OAEP before storage — the raw key is never persisted
- SHA-256 integrity verification on top of GCM's built-in authentication tag
- Encrypted files stored in Amazon S3 (or local disk for development) — plaintext never touches storage
- Folder management, rename/move/delete, drag-and-drop multi-file upload with type/size validation
- Recycle bin with configurable retention and a background purge job
- Secure sharing via random, unguessable tokens with expiry and download limits
- Role-based access control: User / Moderator / Admin, with moderators unable to read users' decrypted files
- Full audit logging and simple rule-based security-event detection (e.g. repeated failed logins)
- Admin dashboard: users, security events, audit logs, system stats
- Responsive React UI with light/dark mode

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, React Router, Axios, Zustand, React Hook Form |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL via Prisma ORM |
| File storage | Amazon S3 (private bucket) — or local disk in development |
| Auth | Argon2id, JWT, TOTP (otplib) |
| Encryption | Node `crypto`: AES-256-GCM + RSA-OAEP(SHA-256) |
| Background jobs | In-process interval job (recycle-bin purge); Redis/BullMQ scaffolding included for scaling |

## 3. Architecture

```
User Browser
     |
     v
React Frontend (Vite)
     |
     v
HTTPS REST API (/api/v1)
     |
     v
Node.js + Express Backend
     |
     +--------------------+
     |                    |
     v                    v
PostgreSQL             Amazon S3 (or local disk)
(metadata, users,      (ENCRYPTED file bytes only —
 encryption metadata,   plaintext never written to storage)
 audit logs, shares)
```

**Where the crypto happens**: `backend/src/crypto/hybridCrypto.ts` contains the entire cryptographic core, isolated from HTTP/DB code so it can be explained and tested independently. `backend/src/services/fileService.ts` is the only place that calls it, wiring encryption into the upload/download pipeline.

## 4. Encryption Process

**Upload:**
```
Original File
     |
     v
Generate random AES-256 key  (crypto.randomBytes, one key PER FILE)
     |
     v
Encrypt file with AES-256-GCM  (produces ciphertext + IV + auth tag)
     |
     +---------------------------+
     |                           |
     v                           v
Encrypted File               AES Key
(-> uploaded to S3)               |
                                   v
                          RSA-OAEP (SHA-256) with server public key
                                   |
                                   v
                          Encrypted AES Key (-> stored in Postgres)
```

**Download:** retrieve ciphertext from storage + wrapped key from Postgres -> unwrap AES key with the RSA **private** key -> AES-256-GCM decrypt (throws if the auth tag doesn't match, i.e. tampering detected) -> verify the result's SHA-256 against the hash stored at upload time -> stream plaintext to the authenticated, authorized requester only.

The raw AES key exists only in memory for the duration of a single request; it is never logged or persisted.

## 5. Vault Mode (password-based envelope encryption)

Vault Mode is an **opt-in second, independent encryption layer** on top of the hybrid RSA+AES pipeline above. It exists to remove a single point of trust: with hybrid crypto alone, anyone holding the server's RSA private key (i.e. the server operator) can decrypt any file. Vault Mode adds a requirement that a **user-held secret** is also needed.

```
Per-file AES-256 key (same key as section 4)
     |
     +----------------------------+----------------------------------+
     |                            |                                  |
     v                            v                                  v
RSA-OAEP wrap                Vault-KEK wrap                  Recovery-KEK wrap
(system key, always)   (Argon2id(vault password))     (Argon2id(recovery code))
     |                            |                                  |
     v                            v                                  v
encryptedAesKey             vaultWrappedAesKey             recoveryWrappedAesKey
(EncryptionMetadata)         (EncryptionMetadata,              (EncryptionMetadata,
                              nullable until protected)          nullable until protected)
```

**Setup:** the user chooses a Vault Password, separate from their login password. The server derives an Argon2id "master secret" from it, then splits that via HKDF-SHA256 into two independent values: one hashed and stored as a login-time **verifier** (`vaultVerifierHash`), the other used as the **KEK** that wraps/unwraps AES file keys. These are cryptographically distinct even though they come from the same password — the verifier alone cannot be used to decrypt anything. A high-entropy **recovery code** is generated and shown exactly once, following the same derive/split/wrap scheme independently, as the "I forgot my vault password" path.

**Unlock:** `POST /api/v1/vault/unlock` verifies the submitted password against the stored verifier and, on success, issues a short-lived (~15 min), signed, httpOnly **vault-session cookie** carrying the derived KEK — a credential distinct from the normal auth session. `GET /api/v1/files/:id/download` requires this vault session for any file with `vaultProtected = true`, enforced in `fileService.downloadFile()` at the service layer (not just the UI), so a direct API call cannot bypass it.

**Recovery, password change, and re-wrapping:** because every file is *always* also RSA-wrapped, the server can recover a file's AES key via the RSA private key at any time — this is what lets `resetVaultPassword()` and `regenerateRecoveryCode()` re-wrap every vault-protected file under a brand-new KEK **without ever needing the old vault password or recovery code**. Losing the vault password is recoverable via the recovery code; losing both is not.

**Trade-off, stated plainly:** this implementation derives the KEK **server-side**, within the scope of the unlock/setup request — the vault password is submitted over TLS and never persisted, logged, or written to disk, but a fully compromised, actively malicious server could in principle capture it at that moment. This is *not* full client-side zero-knowledge encryption. What it does guarantee: a database dump plus the RSA private key **alone** is insufficient to decrypt a vault-protected file — the user's vault secret is a genuinely required, independent input. Upgrading to client-side Argon2id (via WebAssembly) would close the remaining gap and is a natural next step (see section 13).

**Interaction with public share links:** a vault-protected file **cannot** be shared via the app's anonymous public-link feature (`shareService.ts` rejects it outright), since an anonymous recipient has no way to supply the owner's vault password or recovery code. Disable vault protection for a file, or share a non-vault copy, if it needs a public link. The same rule applies per-file inside a **folder** share or folder ZIP download: vault-protected files anywhere under the folder are silently excluded from the ZIP rather than causing the whole share/download to fail, and the response reports how many files were skipped.

**New files after enabling Vault Mode:** enabling Vault Mode does not retroactively protect existing files, or automatically protect files uploaded afterward — the user explicitly runs "Protect existing files" from Settings, which is also how newly uploaded files get vault-wrapped for now (automatic-on-upload is a future improvement, see section 13).

## 6. Database Design

See `backend/prisma/schema.prisma` for the full schema. Core tables: `users`, `sessions`, `files`, `folders`, `encryption_metadata`, `file_versions`, `file_shares`, `recycle_bin_entry`, `audit_logs`, `security_events`, `password_reset_tokens`, `email_verification_tokens`. No plaintext files are ever stored in PostgreSQL — only metadata and the RSA-wrapped AES key per file.

## 7. Installation & Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or use the provided Docker Compose)
- npm

### Backend
```bash
cd backend
cp .env.example .env      # defaults work out of the box for local dev
npm install
npx prisma migrate dev --name init   # creates the database schema
npx prisma generate                 # regenerates the typed Prisma client
npm run prisma:seed                 # creates a default admin (admin@example.com / ChangeMe123!)
npm run dev                         # http://localhost:4000
```

> **Commit `backend/prisma/migrations/`.** `prisma migrate dev` writes the SQL
> migration files there, and the Docker image's startup command runs
> `prisma migrate deploy`, which only applies migrations that are present in
> the repository. Without that folder the container starts against an empty
> database and every request fails.

By default `STORAGE_DRIVER=local`, so the project runs end-to-end **without any AWS account** — encrypted files are written to `backend/storage/`. Set `STORAGE_DRIVER=s3` and fill in the `AWS_*` variables to use a real S3 bucket.

An RSA-2048 keypair is auto-generated on first run under `backend/keys/` in development. **In production, generate this once and inject it as a mounted secret — do not let the app auto-generate keys in production** (the code enforces this).

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:4000` (see `vite.config.ts`), so no CORS configuration is needed locally.

### Running tests
```bash
cd backend
npm test
```
Covers the hybrid cryptography module (encryption round-trip, tamper detection via the GCM auth tag, wrong-key failure, per-file key uniqueness) and password hashing/strength rules.

## 8. Docker

From the project root:
```bash
docker compose up --build
```
This starts PostgreSQL, Redis, the backend (port 4000), and the frontend (port 8080, served via nginx and proxying `/api` to the backend). Run migrations once inside the backend container if they didn't run automatically:
```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

## 9. Environment Variables

See `backend/.env.example` and `frontend/.env.example` for the full list. Never commit a real `.env` file — both are already `.gitignore`d.

A few settings are worth calling out because they decide whether sign-in works
at all on a given deployment:

| Variable | Default | Why it matters |
|---|---|---|
| `COOKIE_SECURE` | `false` | The refresh token lives in a cookie. A `Secure` cookie is silently discarded by the browser over plain HTTP, so leave this `false` for any non-HTTPS demo (including `docker compose up`, which serves the UI on `http://localhost:8080`) and set it to `true` once you are behind HTTPS. |
| `COOKIE_SAMESITE` | `lax` | Use `none` (together with `COOKIE_SECURE=true`) only if the API and the UI are served from different origins. |
| `TRUST_PROXY` | `0` dev / `1` prod | Number of reverse-proxy hops to trust. Set to `1` behind nginx so audit logs and rate limiting see the real client IP instead of the proxy's. |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | When `true`, users must click the emailed verification link before they can sign in. Left off by default so sign-up → sign-in can be demonstrated without a real SMTP provider. |
| `AUTH_RATE_LIMIT_MAX` | `100` dev / `10` prod | Shared budget per 15 minutes across register, login, forgot-password and reset-password. |
| `VAULT_SESSION_SECRET` | dev fallback (change in prod) | Signs the vault-session cookie (see section 5). Deliberately separate from `JWT_SECRET` so the two credentials can be rotated independently. |
| `VAULT_SESSION_EXPIRY` | `15m` | How long an unlocked vault stays unlocked before the download button locks again. |
| `VAULT_UNLOCK_RATE_LIMIT_MAX` | `100` dev / `10` prod | Same rationale as `AUTH_RATE_LIMIT_MAX`, applied to `/vault/unlock` and `/vault/unlock/recovery` since they're an equivalent password-guessing surface. |
| `AWS_S3_ENDPOINT` | unset (real AWS S3) | Set this to use an S3-*compatible* provider instead of AWS itself - e.g. Cloudflare R2 or Backblaze B2, both free with no time limit, unlike AWS's 12-month trial. The existing `S3StorageAdapter` works unmodified against any of them. |
| `AWS_S3_FORCE_PATH_STYLE` | `true` if `AWS_S3_ENDPOINT` is set, else `false` | R2/B2 require path-style bucket addressing; real AWS S3 doesn't. |

## 10. Deployment

Recommended split-service deployment:

```
Frontend  -> Vercel (or any static host / nginx container)
Backend   -> Render / Railway / AWS ECS
Database  -> Managed PostgreSQL (RDS, Supabase, Neon, etc.)
Storage   -> Amazon S3 (private bucket, STORAGE_DRIVER=s3)
```

Checklist before going live:
- Set `NODE_ENV=production`
- Provide real `JWT_SECRET` / `JWT_REFRESH_SECRET` (long, random)
- Mount a production-generated RSA keypair as a secret (do not rely on auto-generation)
- Set `STORAGE_DRIVER=s3` with a private bucket and least-privilege IAM credentials
- Configure a real SMTP provider and set `EMAIL_DEV_MODE=false`
- Enforce HTTPS at the load balancer / reverse proxy
- Set `FRONTEND_URL` to the real production frontend origin (used for CORS + cookie scoping)

### Free object storage for a demo/defense (no AWS card required)

For running a live demo or defense without setting up a paid AWS account, point the *same* `s3` storage driver at a free, S3-compatible provider instead:

```
STORAGE_DRIVER=s3
AWS_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com   # Cloudflare R2
AWS_S3_FORCE_PATH_STYLE=true
AWS_S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=auto
```

**Cloudflare R2** (recommended: 10GB free, forever, no time limit and no card required) or **Backblaze B2** (also 10GB free forever) both work here with zero code changes - only the four `AWS_S3_*` variables above differ from a real-AWS setup. This is deliberately the same `S3StorageAdapter` class already used for real AWS S3: Postgres holds every piece of user/file *metadata* (emails, filenames, encryption keys, audit logs), while the encrypted file *bytes* live entirely in whichever object store `STORAGE_DRIVER` points at - swapping providers is a config change, not a code change, which is worth calling out explicitly in a defense as evidence the storage layer is genuinely decoupled from the rest of the system.

## 11. API Documentation

- Interactive Swagger UI: `GET /api/v1/docs` once the backend is running
- Full OpenAPI spec: `openapi.yaml` in the project root
- Postman collection: `postman_collection.json` in the project root

All responses follow a consistent envelope: `{ "success": boolean, "message": string, "data": {} }`.

## 12. Security Notes

- Passwords hashed with Argon2id; never logged or returned by any endpoint
- File contents encrypted with AES-256-GCM (confidentiality + built-in tamper detection); the AES key is protected with RSA-OAEP and never stored in plaintext
- Refresh tokens are opaque random strings stored as SHA-256 hashes (not JWTs), rotated on every use, and revocable per-session
- Rate limiting on auth endpoints; Helmet, CORS allow-list, and centralized error handling (no stack traces leaked to clients)
- Authorization checked on the backend for every file operation — a user cannot access another user's file by guessing an ID
- Share links use cryptographically random tokens, never sequential IDs, and respect expiry/download-limit/revocation server-side
- Uploads validated by MIME allow-list, filename sanitization (no path traversal), and a size cap
- **Vault Mode** (opt-in, see section 5): a second, independent password-derived key-encryption-key wraps vault-protected files' AES keys; downloads of such files are rejected at the service layer without a valid, separately-signed vault-session token, even via a direct API call

## 13. Limitations & Future Improvements

This is an academic final-year project, and the following are intentionally out of scope for v1 but designed to be extended:
- **Malware scanning**: the upload pipeline validates type/size/filename but does not integrate a live antivirus scanner (e.g. ClamAV) out of the box — see spec section 34 for the intended integration point (scan before encryption).
- **AI-based anomaly detection**: only simple rule-based security-event flagging is implemented (e.g. 5+ failed logins in 15 minutes). A dedicated ML risk-scoring service can be added later without changing the audit/security-event schema.
- **Encrypted-content search**: search operates on filenames/metadata only, since file contents are encrypted at rest — full-text search on decrypted content is a possible future enhancement (with appropriate access controls).
- **Multi-instance background jobs**: the recycle-bin cleanup job currently runs as an in-process interval; swap for a BullMQ repeatable job (Redis is already wired in) if scaling to multiple backend instances.
- **Key rotation**: `rsaKeyId` is stored per file specifically to support future RSA key rotation, but a rotation procedure/script is not yet implemented.
- **Client-side Vault Mode key derivation**: Vault Mode (section 5) currently derives the KEK server-side, within request scope; moving Argon2id derivation into the browser (WASM) would make it genuinely zero-knowledge instead of "second independent factor."
- **Automatic vault protection for new uploads**: once Vault Mode is enabled, newly uploaded files are not automatically vault-wrapped — the user re-runs "Protect existing files" periodically. Wiring this into the upload path directly (given an unlocked vault session) is a natural follow-up.
- **Shareable vault-protected files**: public share links are currently blocked entirely for vault-protected files (see section 5); a share-specific password (a third, independent key wrap) would let this feature coexist with Vault Mode.
- **Folder-level vault protection**: "Protect existing files" (Settings → Security) protects every file the user owns, not per-folder; a "protect just this folder" action would need a folder-scoped variant of the same batch job.
- **Folder ZIP generation is in-memory, non-streaming**: `folderService.downloadFolderAsZip()` builds the whole ZIP in memory (via `jszip`) before sending it, which is simple and fine at this project's scale but would need to move to a streaming archiver (e.g. `archiver` piped directly to the HTTP response) for very large folders in a production setting.

## 14. Dependency Security

Run `npm audit` in both `backend/` and `frontend/` periodically — this project currently audits clean (0 vulnerabilities) as of the versions pinned in `package.json`. If new advisories appear after you `npm install`:
- Run `npm audit` first to see exactly what's flagged and its severity
- Run `npm audit fix` (no `--force`) to apply non-breaking patches
- For anything requiring `--force`, check whether the package is actually imported in `src/` before upgrading — several past findings (e.g. an unused `bcrypt` dependency, since this project uses Argon2id) were resolved simply by removing dead dependencies rather than forcing major-version bumps
- Dev-only tooling vulnerabilities (e.g. in Vite's dev server) carry much lower real risk than vulnerabilities in packages used at runtime with user input — prioritize accordingly
