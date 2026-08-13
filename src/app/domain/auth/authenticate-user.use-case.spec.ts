import type { UserRole } from './authorization-policy';
import {
  AuthenticateUserUseCase,
  AuthenticationFailedError,
  type AuthenticationRepository,
  type AuthenticationUser,
} from './authenticate-user.use-case';
import type { PasswordCredential, PasswordHasher } from './password-credential.service';

const CREDENTIAL: PasswordCredential = { algorithm: 'fixture', salt: 'salt', hash: 'correcta' };

class FixtureHasher implements PasswordHasher {
  async hash(password: string): Promise<PasswordCredential> {
    return { ...CREDENTIAL, hash: password };
  }

  async verify(password: string, credential: PasswordCredential): Promise<boolean> {
    return password === credential.hash;
  }
}

class FixtureRepository implements AuthenticationRepository {
  user: AuthenticationUser | null = createUser();
  failures: Array<{ attempts: number; blockedUntilUtc: string | null }> = [];
  successfulLogins = 0;

  async findByNormalizedUsername(): Promise<AuthenticationUser | null> {
    return this.user;
  }

  async recordFailedAttempt(
    _userId: string,
    attempts: number,
    blockedUntilUtc: string | null,
    _occurredAtUtc: string,
  ): Promise<void> {
    this.failures.push({ attempts, blockedUntilUtc });
    if (this.user) this.user = { ...this.user, failedAttempts: attempts, blockedUntilUtc };
  }

  async recordSuccessfulLogin(): Promise<void> {
    this.successfulLogins += 1;
  }
}

describe('AuthenticateUserUseCase', () => {
  let repository: FixtureRepository;
  let useCase: AuthenticateUserUseCase;

  beforeEach(() => {
    repository = new FixtureRepository();
    useCase = new AuthenticateUserUseCase(
      repository,
      new FixtureHasher(),
      () => 'audit-login',
      () => '2026-07-29T15:00:00.000Z',
    );
  });

  it('normalizes the username and returns the authenticated identity', async () => {
    const result = await useCase.execute({ username: '  ADMINISTRADOR ', password: 'correcta' });

    expect(result).toEqual({
      userId: 'user-1',
      role: 'ADMINISTRADOR',
      displayName: 'Administrador',
    });
    expect(repository.successfulLogins).toBe(1);
  });

  it('returns one generic error for an unknown user or invalid password', async () => {
    await expect(
      useCase.execute({ username: 'administrador', password: 'incorrecta' }),
    ).rejects.toBeInstanceOf(AuthenticationFailedError);
    repository.user = null;
    await expect(
      useCase.execute({ username: 'desconocido', password: 'incorrecta' }),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('blocks for five minutes on the fifth consecutive failure', async () => {
    repository.user = createUser({ failedAttempts: 4 });

    await expect(
      useCase.execute({ username: 'administrador', password: 'incorrecta' }),
    ).rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(repository.failures).toEqual([
      { attempts: 0, blockedUntilUtc: '2026-07-29T15:05:00.000Z' },
    ]);
  });

  it('does not authenticate while the five-minute block is active', async () => {
    repository.user = createUser({ blockedUntilUtc: '2026-07-29T15:04:59.999Z' });

    await expect(
      useCase.execute({ username: 'administrador', password: 'correcta' }),
    ).rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(repository.successfulLogins).toBe(0);
    expect(repository.failures).toEqual([]);
  });

  it('allows authentication once the block has expired', async () => {
    repository.user = createUser({ blockedUntilUtc: '2026-07-29T15:00:00.000Z' });

    await expect(
      useCase.execute({ username: 'administrador', password: 'correcta' }),
    ).resolves.toMatchObject({ userId: 'user-1' });
  });
});

function createUser(overrides: Partial<AuthenticationUser> = {}): AuthenticationUser {
  return {
    id: 'user-1',
    role: 'ADMINISTRADOR' as UserRole,
    displayName: 'Administrador',
    active: true,
    credential: CREDENTIAL,
    failedAttempts: 0,
    blockedUntilUtc: null,
    ...overrides,
  };
}
