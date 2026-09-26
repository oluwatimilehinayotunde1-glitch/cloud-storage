-- Vault Mode: additive-only migration. Existing rows/files are
-- unaffected: vaultEnabled/vaultProtected default to false and every
-- new column is nullable, so files encrypted before this migration
-- keep working through the existing RSA-only path with no changes.

-- AlterTable: User
ALTER TABLE "User"
  ADD COLUMN "vaultEnabled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "vaultSalt"            TEXT,
  ADD COLUMN "vaultVerifierHash"    TEXT,
  ADD COLUMN "vaultKeyVersion"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recoverySalt"         TEXT,
  ADD COLUMN "recoveryVerifierHash" TEXT;

-- AlterTable: File
ALTER TABLE "File"
  ADD COLUMN "vaultProtected" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: EncryptionMetadata
ALTER TABLE "EncryptionMetadata"
  ADD COLUMN "vaultWrappedAesKey"    TEXT,
  ADD COLUMN "vaultWrapIv"           TEXT,
  ADD COLUMN "vaultWrapAuthTag"      TEXT,
  ADD COLUMN "vaultKeyVersion"       INTEGER,
  ADD COLUMN "recoveryWrappedAesKey" TEXT,
  ADD COLUMN "recoveryWrapIv"        TEXT,
  ADD COLUMN "recoveryWrapAuthTag"   TEXT;
