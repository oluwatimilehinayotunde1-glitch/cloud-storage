import { hashPassword, verifyPassword, validatePasswordStrength } from '../src/utils/password';

describe('Password hashing (Argon2id)', () => {
  it('never stores the plaintext password in the hash', async () => {
    const hash = await hashPassword('SuperSecret123');
    expect(hash).not.toContain('SuperSecret123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('SuperSecret123');
    expect(await verifyPassword(hash, 'SuperSecret123')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('SuperSecret123');
    expect(await verifyPassword(hash, 'WrongPassword')).toBe(false);
  });

  it('produces a different hash for the same password each time (random salt)', async () => {
    const hash1 = await hashPassword('SuperSecret123');
    const hash2 = await hashPassword('SuperSecret123');
    expect(hash1).not.toEqual(hash2);
  });
});

describe('Password strength validation', () => {
  it('rejects short passwords', () => {
    expect(validatePasswordStrength('Ab1')).toMatch(/at least/);
  });

  it('rejects passwords without an uppercase letter', () => {
    expect(validatePasswordStrength('lowercase123')).toMatch(/uppercase/);
  });

  it('rejects passwords without a number', () => {
    expect(validatePasswordStrength('NoNumberHere')).toMatch(/number/);
  });

  it('accepts a strong password', () => {
    expect(validatePasswordStrength('StrongPass123')).toBeNull();
  });
});
