import {
  generateAesKey,
  encryptFileBuffer,
  decryptFileBuffer,
  wrapAesKey,
  unwrapAesKey,
  generateRsaKeyPair,
  hybridEncryptFile,
  hybridDecryptFile,
  sha256Hex,
} from '../src/crypto/hybridCrypto';

describe('AES-256-GCM file encryption', () => {
  it('generates a fresh 256-bit key each call', () => {
    const key1 = generateAesKey();
    const key2 = generateAesKey();
    expect(key1.length).toBe(32);
    expect(key1.equals(key2)).toBe(false);
  });

  it('encrypts and decrypts a file buffer losslessly', () => {
    const plaintext = Buffer.from('This is a confidential final-year project file.');
    const key = generateAesKey();

    const { ciphertext, iv, authTag } = encryptFileBuffer(plaintext, key);
    expect(ciphertext.equals(plaintext)).toBe(false); // actually encrypted

    const decrypted = decryptFileBuffer(ciphertext, key, iv, authTag);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('detects tampering via the GCM authentication tag', () => {
    const plaintext = Buffer.from('Integrity matters.');
    const key = generateAesKey();
    const { ciphertext, iv, authTag } = encryptFileBuffer(plaintext, key);

    const tampered = Buffer.from(ciphertext);
    tampered[0] ^= 0xff; // flip a bit

    expect(() => decryptFileBuffer(tampered, key, iv, authTag)).toThrow(/authentication tag mismatch/);
  });

  it('fails to decrypt with the wrong key', () => {
    const plaintext = Buffer.from('Secret contents');
    const key = generateAesKey();
    const wrongKey = generateAesKey();
    const { ciphertext, iv, authTag } = encryptFileBuffer(plaintext, key);

    expect(() => decryptFileBuffer(ciphertext, wrongKey, iv, authTag)).toThrow();
  });

  it('rejects a key that is not 256 bits', () => {
    const shortKey = Buffer.alloc(16);
    expect(() => encryptFileBuffer(Buffer.from('x'), shortKey)).toThrow(/Invalid AES key length/);
  });
});

describe('RSA-OAEP key wrapping', () => {
  const { publicKey, privateKey } = generateRsaKeyPair();

  it('wraps and unwraps an AES key correctly', () => {
    const aesKey = generateAesKey();
    const wrapped = wrapAesKey(aesKey, publicKey, 'test-key-1');

    expect(wrapped.encryptedAesKeyB64).not.toEqual(aesKey.toString('base64'));

    const unwrapped = unwrapAesKey(wrapped.encryptedAesKeyB64, privateKey);
    expect(unwrapped.equals(aesKey)).toBe(true);
  });

  it('fails to unwrap with the wrong private key', () => {
    const aesKey = generateAesKey();
    const wrapped = wrapAesKey(aesKey, publicKey, 'test-key-1');
    const otherPair = generateRsaKeyPair();

    expect(() => unwrapAesKey(wrapped.encryptedAesKeyB64, otherPair.privateKey)).toThrow();
  });
});

describe('End-to-end hybrid encryption', () => {
  const { publicKey, privateKey } = generateRsaKeyPair();

  it('round-trips a file through the full hybrid scheme', () => {
    const plaintext = Buffer.from('Final year project demonstration file contents.');

    const encrypted = hybridEncryptFile(plaintext, publicKey, 'test-key-1');
    expect(encrypted.sha256).toBe(sha256Hex(plaintext));

    const decrypted = hybridDecryptFile(
      encrypted.ciphertext,
      encrypted.ivB64,
      encrypted.authTagB64,
      encrypted.encryptedAesKeyB64,
      privateKey,
      encrypted.sha256
    );

    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('throws if the stored SHA-256 hash no longer matches after decryption', () => {
    const plaintext = Buffer.from('Some file content');
    const encrypted = hybridEncryptFile(plaintext, publicKey, 'test-key-1');

    expect(() =>
      hybridDecryptFile(
        encrypted.ciphertext,
        encrypted.ivB64,
        encrypted.authTagB64,
        encrypted.encryptedAesKeyB64,
        privateKey,
        '0000000000000000000000000000000000000000000000000000000000000' // wrong hash
      )
    ).toThrow(/Integrity check failed/);
  });

  it('generates a different ciphertext and key for the same plaintext each time', () => {
    const plaintext = Buffer.from('Repeated content');
    const first = hybridEncryptFile(plaintext, publicKey, 'test-key-1');
    const second = hybridEncryptFile(plaintext, publicKey, 'test-key-1');

    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
    expect(first.encryptedAesKeyB64).not.toEqual(second.encryptedAesKeyB64);
  });
});
