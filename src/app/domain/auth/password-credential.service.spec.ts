import {
  ARGON2ID_ALGORITHM,
  Argon2idPasswordHasher,
  InvalidPasswordError,
  PasswordPolicy,
} from './password-credential.service';

describe('PasswordPolicy', () => {
  const policy = new PasswordPolicy();

  it('accepts passwords from 8 through 64 characters', () => {
    expect(() => policy.assertValid('12345678')).not.toThrow();
    expect(() => policy.assertValid('a'.repeat(64))).not.toThrow();
    expect(() => policy.assertValid('🔐'.repeat(8))).not.toThrow();
  });

  it('rejects passwords outside the approved length without retaining their value', () => {
    for (const password of ['1234567', 'a'.repeat(65)]) {
      try {
        policy.assertValid(password);
        expect.fail('The password should have been rejected.');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(InvalidPasswordError);
        expect(error).toMatchObject({
          code: 'INVALID_PASSWORD_LENGTH',
          message: 'La contraseña debe tener entre 8 y 64 caracteres.',
        });
        expect(JSON.stringify(error)).not.toContain(password);
      }
    }
  });
});

describe('Argon2idPasswordHasher', () => {
  const hasher = new Argon2idPasswordHasher();

  it('uses Argon2id with an individual random salt', async () => {
    const first = await hasher.hash('frase segura 123');
    const second = await hasher.hash('frase segura 123');

    expect(first.algorithm).toBe(ARGON2ID_ALGORITHM);
    expect(first.salt).toMatch(/^[a-f0-9]{32}$/);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.salt).not.toBe(first.salt);
    expect(second.hash).not.toBe(first.hash);
    expect(JSON.stringify(first)).not.toContain('frase segura 123');
  });

  it('verifies the correct password and rejects an incorrect one', async () => {
    const credential = await hasher.hash('otra frase segura');

    await expect(hasher.verify('otra frase segura', credential)).resolves.toBe(true);
    await expect(hasher.verify('clave equivocada', credential)).resolves.toBe(false);
  });

  it('rejects credentials from an unknown algorithm without attempting migration', async () => {
    await expect(
      hasher.verify('12345678', {
        algorithm: 'unknown',
        salt: '00'.repeat(16),
        hash: '00'.repeat(32),
      }),
    ).resolves.toBe(false);
  });
});
