import type { PasswordCredential, PasswordHasher } from './password-credential.service';

export const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_LENGTH = 24;

export type RecoveryRandomBytes = (length: number) => Uint8Array;

export class LocalRecoveryCodeService {
  constructor(
    private readonly passwordHasher: PasswordHasher,
    private readonly randomBytes: RecoveryRandomBytes = generateSecureRandomBytes,
  ) {}

  generate(): string {
    const bytes = this.randomBytes(RECOVERY_CODE_LENGTH);
    const characters = Array.from(
      bytes,
      (byte) => RECOVERY_CODE_ALPHABET[byte & (RECOVERY_CODE_ALPHABET.length - 1)],
    );
    const groups: string[] = [];
    for (let index = 0; index < characters.length; index += 4) {
      groups.push(characters.slice(index, index + 4).join(''));
    }
    return groups.join('-');
  }

  hash(code: string): Promise<PasswordCredential> {
    return this.passwordHasher.hash(normalizeRecoveryCode(code));
  }

  verify(code: string, credential: PasswordCredential): Promise<boolean> {
    return this.passwordHasher.verify(normalizeRecoveryCode(code), credential);
  }
}

export function normalizeRecoveryCode(code: string): string {
  return code.normalize('NFKC').replace(/[\s-]/g, '').toUpperCase();
}

function generateSecureRandomBytes(length: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('A cryptographically secure random generator is unavailable.');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
