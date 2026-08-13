import type { PasswordCredential, PasswordHasher } from './password-credential.service';
import { LocalRecoveryCodeService, normalizeRecoveryCode } from './recovery-code.service';

class FixtureHasher implements PasswordHasher {
  async hash(password: string): Promise<PasswordCredential> {
    return { algorithm: 'fixture', salt: 'salt', hash: `hash:${password}` };
  }
  async verify(password: string, credential: PasswordCredential): Promise<boolean> {
    return credential.hash === `hash:${password}`;
  }
}

describe('LocalRecoveryCodeService', () => {
  it('generates a 24-character code grouped for offline transcription', () => {
    const service = new LocalRecoveryCodeService(new FixtureHasher(), (length) =>
      Uint8Array.from({ length }, (_, index) => index),
    );

    expect(service.generate()).toBe('ABCD-EFGH-JKLM-NPQR-STUV-WXYZ');
  });

  it('normalizes spaces, hyphens and case before hashing and verification', async () => {
    const service = new LocalRecoveryCodeService(new FixtureHasher(), () => new Uint8Array(24));
    const credential = await service.hash('ABCD-EFGH-JKLM-NPQR-STUV-WXYZ');

    await expect(service.verify(' abcd efgh-jklm npqr-stuv wxyz ', credential)).resolves.toBe(true);
    expect(normalizeRecoveryCode(' ab-cd ')).toBe('ABCD');
  });
});
