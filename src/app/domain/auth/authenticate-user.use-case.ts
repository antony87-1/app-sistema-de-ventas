import type { UserRole } from './authorization-policy';
import type { PasswordCredential, PasswordHasher } from './password-credential.service';
import type { IdentifierGenerator, UtcClock } from './provision-initial-users.use-case';

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_DURATION_MS = 5 * 60 * 1000;

export interface AuthenticationUser {
  readonly id: string;
  readonly role: UserRole;
  readonly displayName: string;
  readonly active: boolean;
  readonly credential: PasswordCredential;
  readonly failedAttempts: number;
  readonly blockedUntilUtc: string | null;
}

export interface AuthenticationRepository {
  findByNormalizedUsername(normalizedUsername: string): Promise<AuthenticationUser | null>;
  recordFailedAttempt(
    userId: string,
    attempts: number,
    blockedUntilUtc: string | null,
    occurredAtUtc: string,
  ): Promise<void>;
  recordSuccessfulLogin(userId: string, auditId: string, occurredAtUtc: string): Promise<void>;
}

export interface AuthenticateUserInput {
  readonly username: string;
  readonly password: string;
}

export interface AuthenticatedIdentity {
  readonly userId: string;
  readonly role: UserRole;
  readonly displayName: string;
}

export class AuthenticationFailedError extends Error {
  readonly code = 'AUTHENTICATION_FAILED';

  constructor() {
    super('No se pudo iniciar sesión. Verifica tus datos o espera unos minutos.');
    this.name = 'AuthenticationFailedError';
  }
}

export class AuthenticateUserUseCase {
  constructor(
    private readonly repository: AuthenticationRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly generateId: IdentifierGenerator,
    private readonly nowUtc: UtcClock,
  ) {}

  async execute(input: AuthenticateUserInput): Promise<AuthenticatedIdentity> {
    const normalizedUsername = normalizeUsername(input.username);
    const user = await this.repository.findByNormalizedUsername(normalizedUsername);

    if (user === null) throw new AuthenticationFailedError();

    const occurredAtUtc = this.nowUtc();
    const nowMilliseconds = Date.parse(occurredAtUtc);
    const blockedUntilMilliseconds =
      user.blockedUntilUtc === null ? Number.NaN : Date.parse(user.blockedUntilUtc);

    if (!user.active || blockedUntilMilliseconds > nowMilliseconds) {
      throw new AuthenticationFailedError();
    }

    const passwordMatches = await this.passwordHasher.verify(input.password, user.credential);

    if (!passwordMatches) {
      const nextAttempts = user.failedAttempts + 1;
      const shouldBlock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      const blockedUntilUtc = shouldBlock
        ? new Date(nowMilliseconds + LOGIN_LOCKOUT_DURATION_MS).toISOString()
        : null;
      await this.repository.recordFailedAttempt(
        user.id,
        shouldBlock ? 0 : nextAttempts,
        blockedUntilUtc,
        occurredAtUtc,
      );
      throw new AuthenticationFailedError();
    }

    await this.repository.recordSuccessfulLogin(user.id, this.generateId(), occurredAtUtc);
    return { userId: user.id, role: user.role, displayName: user.displayName };
  }
}

export function normalizeUsername(username: string): string {
  return username.trim().normalize('NFKC').toLocaleLowerCase('es-PE');
}
