import { argon2id } from 'hash-wasm';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export const ARGON2ID_PARAMETERS = Object.freeze({
  version: 19,
  memorySizeKib: 19_456,
  iterations: 2,
  parallelism: 1,
  saltLengthBytes: 16,
  hashLengthBytes: 32,
} as const);

export const ARGON2ID_ALGORITHM = 'argon2id$v=19$m=19456,t=2,p=1,l=32,s=16';

export interface PasswordCredential {
  readonly algorithm: string;
  readonly salt: string;
  readonly hash: string;
}

export interface PasswordHasher {
  hash(password: string): Promise<PasswordCredential>;
  verify(password: string, credential: PasswordCredential): Promise<boolean>;
}

export class InvalidPasswordError extends Error {
  readonly code = 'INVALID_PASSWORD_LENGTH';

  constructor() {
    super('La contraseña debe tener entre 8 y 64 caracteres.');
    this.name = 'InvalidPasswordError';
  }
}

export class PasswordPolicy {
  assertValid(password: string): void {
    const characterCount = [...password].length;

    if (characterCount < PASSWORD_MIN_LENGTH || characterCount > PASSWORD_MAX_LENGTH) {
      throw new InvalidPasswordError();
    }
  }
}

export type SecureRandomBytes = (length: number) => Uint8Array;

export class Argon2idPasswordHasher implements PasswordHasher {
  constructor(private readonly randomBytes: SecureRandomBytes = generateSecureRandomBytes) {}

  async hash(password: string): Promise<PasswordCredential> {
    const saltBytes = this.randomBytes(ARGON2ID_PARAMETERS.saltLengthBytes);
    const hash = await deriveHash(password, saltBytes);

    return {
      algorithm: ARGON2ID_ALGORITHM,
      salt: encodeHex(saltBytes),
      hash,
    };
  }

  async verify(password: string, credential: PasswordCredential): Promise<boolean> {
    if (
      credential.algorithm !== ARGON2ID_ALGORITHM ||
      !isHexOfBytes(credential.salt, ARGON2ID_PARAMETERS.saltLengthBytes) ||
      !isHexOfBytes(credential.hash, ARGON2ID_PARAMETERS.hashLengthBytes)
    ) {
      return false;
    }

    const candidateHash = await deriveHash(password, decodeHex(credential.salt));
    return constantTimeEqual(candidateHash, credential.hash);
  }
}

async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  return argon2id({
    password,
    salt,
    iterations: ARGON2ID_PARAMETERS.iterations,
    parallelism: ARGON2ID_PARAMETERS.parallelism,
    memorySize: ARGON2ID_PARAMETERS.memorySizeKib,
    hashLength: ARGON2ID_PARAMETERS.hashLengthBytes,
    outputType: 'hex',
  });
}

function generateSecureRandomBytes(length: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('A cryptographically secure random generator is unavailable.');
  }

  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function isHexOfBytes(value: string, lengthBytes: number): boolean {
  return value.length === lengthBytes * 2 && /^[a-f0-9]+$/.test(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}
