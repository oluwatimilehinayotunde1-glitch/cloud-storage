import {
  generateVaultSalt,
  deriveMasterSecret,
  deriveKek,
  computeVerifierHash,
  verifierHashesMatch,
  generateRecoveryCode,
  wrapAesKeyWithKek,
  unwrapAesKeyWithKek,
} from '../src/crypto/vaultCrypto';
import { generateAesKey } from '../src/crypto/hybridCrypto';

describe('Argon2id master-secret derivation', () => {
  it('derives the same master secret for the same password + salt', async () => {
    const salt = generateVaultSalt();
    const a = await deriveMasterSecret('Correct-Horse-1', salt);
    const b = await deriveMasterSecret('Correct-Horse-1', salt);
    expect(a.equals(b)).toBe(true);
  });

  it('derives a different master secret for a different password', async () => {
    const salt = generateVaultSalt();
    const a = await deriveMasterSecret('Correct-Horse-1', salt);
    const b = await deriveMasterSecret('Wrong-Horse-1', salt);
    expect(a.equals(b)).toBe(false);
  });

  it('derives a different master secret for a different salt, same password', async () => {
    const a = await deriveMasterSecret('Correct-Horse-1', generateVaultSalt());
    const b = await deriveMasterSecret('Correct-Horse-1', generateVaultSalt());
    expect(a.equals(b)).toBe(false);
  });
});

describe('HKDF split: verifier vs KEK independence', () => {
  it('produces a verifier hash and a KEK that are provably different values', async () => {
    const salt = generateVaultSalt();
    const masterSecret = await deriveMasterSecret('Correct-Horse-1', salt);

    const verifierHash = computeVerifierHash(masterSecret);
    const kek = deriveKek(masterSecret);

    // The verifier is a hex SHA-256 digest; the KEK is a raw 32-byte
    // key. Compare them as buffers of the same encoding to make sure
    // one isn't secretly reused as the other.
    expect(Buffer.from(verifierHash, 'hex').equals(kek)).toBe(false);
  });

  it('verifierHashesMatch correctly compares equal and unequal hashes', async () => {
    const salt = generateVaultSalt();
    const masterSecret = await deriveMasterSecret('Correct-Horse-1', salt);
    const hashA = computeVerifierHash(masterSecret);
    const hashB = computeVerifierHash(await deriveMasterSecret('Correct-Horse-1', salt));
    const hashC = computeVerifierHash(await deriveMasterSecret('Different-Password', salt));

    expect(verifierHashesMatch(hashA, hashB)).toBe(true);
    expect(verifierHashesMatch(hashA, hashC)).toBe(false);
  });
});

describe('Recovery code generation', () => {
  it('generates high-entropy, differently-formatted codes each time', () => {
    const a = generateRecoveryCode();
    const b = generateRecoveryCode();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[0-9A-Z-]+$/);
    expect(a.split('-').length).toBeGreaterThanOrEqual(5);
  });
});

describe('AES key wrapping under a password-derived KEK', () => {
  it('wraps and unwraps an AES key correctly with the right KEK', async () => {
    const salt = generateVaultSalt();
    const masterSecret = await deriveMasterSecret('Correct-Horse-1', salt);
    const kek = deriveKek(masterSecret);

    const aesKey = generateAesKey();
    const wrapped = wrapAesKeyWithKek(aesKey, kek);
    expect(wrapped.wrappedKeyB64).not.toEqual(aesKey.toString('base64'));

    const unwrapped = unwrapAesKeyWithKek(wrapped, kek);
    expect(unwrapped.equals(aesKey)).toBe(true);
  });

  it('fails to unwrap with the wrong KEK (wrong vault password)', async () => {
    const salt = generateVaultSalt();
    const kek = deriveKek(await deriveMasterSecret('Correct-Horse-1', salt));
    const wrongKek = deriveKek(await deriveMasterSecret('Wrong-Horse-1', salt));

    const aesKey = generateAesKey();
    const wrapped = wrapAesKeyWithKek(aesKey, kek);

    expect(() => unwrapAesKeyWithKek(wrapped, wrongKek)).toThrow(/authentication tag mismatch/);
  });

  it('detects tampering with the wrapped key via the GCM auth tag', async () => {
    const kek = deriveKek(await deriveMasterSecret('Correct-Horse-1', generateVaultSalt()));
    const aesKey = generateAesKey();
    const wrapped = wrapAesKeyWithKek(aesKey, kek);

    const tamperedBytes = Buffer.from(wrapped.wrappedKeyB64, 'base64');
    tamperedBytes[0] ^= 0xff;
    const tampered = { ...wrapped, wrappedKeyB64: tamperedBytes.toString('base64') };

    expect(() => unwrapAesKeyWithKek(tampered, kek)).toThrow(/authentication tag mismatch/);
  });

  it('produces a different ciphertext for the same key each time (fresh IV)', async () => {
    const kek = deriveKek(await deriveMasterSecret('Correct-Horse-1', generateVaultSalt()));
    const aesKey = generateAesKey();
    const first = wrapAesKeyWithKek(aesKey, kek);
    const second = wrapAesKeyWithKek(aesKey, kek);

    expect(first.wrappedKeyB64).not.toEqual(second.wrappedKeyB64);
    expect(first.ivB64).not.toEqual(second.ivB64);
  });
});

describe('End-to-end: recovery-code path recovers the same KEK independently of the vault password', () => {
  it('wraps the same AES key under two independently-derived KEKs, both of which unwrap it', async () => {
    const vaultKek = deriveKek(await deriveMasterSecret('My-Vault-Password-1', generateVaultSalt()));
    const recoveryKek = deriveKek(await deriveMasterSecret(generateRecoveryCode(), generateVaultSalt()));

    const aesKey = generateAesKey();
    const vaultWrapped = wrapAesKeyWithKek(aesKey, vaultKek);
    const recoveryWrapped = wrapAesKeyWithKek(aesKey, recoveryKek);

    expect(unwrapAesKeyWithKek(vaultWrapped, vaultKek).equals(aesKey)).toBe(true);
    expect(unwrapAesKeyWithKek(recoveryWrapped, recoveryKek).equals(aesKey)).toBe(true);
    // Neither KEK can unwrap the other's wrap.
    expect(() => unwrapAesKeyWithKek(vaultWrapped, recoveryKek)).toThrow();
    expect(() => unwrapAesKeyWithKek(recoveryWrapped, vaultKek)).toThrow();
  });
});
