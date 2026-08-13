import type {
  InitialUserProvisioning,
  InitialUsersRepository,
  NewUserRecord,
  UserAuditRecord,
} from './provision-initial-users.use-case';
import {
  DuplicateInitialUsernameError,
  InitialUsersAlreadyExistError,
  ProvisionInitialUsersUseCase,
} from './provision-initial-users.use-case';
import type { PasswordCredential, PasswordHasher } from './password-credential.service';
import { PasswordPolicy } from './password-credential.service';
import { LocalRecoveryCodeService } from './recovery-code.service';

class FakeInitialUsersRepository implements InitialUsersRepository {
  hasUsers = false;
  saved?: InitialUserProvisioning;

  async hasAnyUsers(): Promise<boolean> {
    return this.hasUsers;
  }

  async provision(provisioning: InitialUserProvisioning): Promise<void> {
    this.saved = provisioning;
    this.hasUsers = true;
  }
}

class FakePasswordHasher implements PasswordHasher {
  readonly receivedPasswords: string[] = [];

  async hash(password: string): Promise<PasswordCredential> {
    this.receivedPasswords.push(password);
    return {
      algorithm: 'argon2id-test',
      salt: `salt-${this.receivedPasswords.length}`,
      hash: `hash-${this.receivedPasswords.length}`,
    };
  }

  async verify(): Promise<boolean> {
    return false;
  }
}

const input = {
  administrator: {
    username: '  Administrador  ',
    displayName: 'Dueño del negocio',
    password: 'admin-123',
  },
  cashier: {
    username: '  Caja Principal  ',
    displayName: 'Caja principal',
    password: 'cajero-123',
  },
} as const;

describe('ProvisionInitialUsersUseCase', () => {
  let repository: FakeInitialUsersRepository;
  let passwordHasher: FakePasswordHasher;
  let useCase: ProvisionInitialUsersUseCase;

  beforeEach(() => {
    repository = new FakeInitialUsersRepository();
    passwordHasher = new FakePasswordHasher();
    const ids = [
      'user-admin',
      'user-cashier',
      'recovery-admin',
      'audit-admin',
      'audit-cashier',
      'audit-recovery',
    ];

    useCase = new ProvisionInitialUsersUseCase(
      repository,
      passwordHasher,
      new PasswordPolicy(),
      new LocalRecoveryCodeService(passwordHasher, () => new Uint8Array(24)),
      () => ids.shift() ?? expect.fail('Unexpected identifier request.'),
      () => '2026-07-29T13:00:00.000Z',
    );
  });

  it('provisions exactly one administrator and one cashier with hashed credentials', async () => {
    const result = await useCase.execute(input);

    expect(result).toEqual({
      administratorId: 'user-admin',
      cashierId: 'user-cashier',
      recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA',
    });
    expect(passwordHasher.receivedPasswords).toEqual([
      'admin-123',
      'cajero-123',
      'AAAAAAAAAAAAAAAAAAAAAAAA',
    ]);
    expect(repository.saved?.users).toEqual([
      expectedUser({
        id: 'user-admin',
        role: 'ADMINISTRADOR',
        username: 'Administrador',
        normalizedUsername: 'administrador',
        displayName: 'Dueño del negocio',
        passwordHash: 'hash-1',
        passwordSalt: 'salt-1',
      }),
      expectedUser({
        id: 'user-cashier',
        role: 'CAJERO',
        username: 'Caja Principal',
        normalizedUsername: 'caja principal',
        displayName: 'Caja principal',
        passwordHash: 'hash-2',
        passwordSalt: 'salt-2',
      }),
    ]);
    expect(JSON.stringify(repository.saved)).not.toContain('admin-123');
    expect(JSON.stringify(repository.saved)).not.toContain('cajero-123');
    expect(JSON.stringify(repository.saved)).not.toContain('AAAA-AAAA');
    expect(repository.saved?.recoveryCredential).toEqual({
      id: 'recovery-admin',
      userId: 'user-admin',
      codeHash: 'hash-3',
      codeSalt: 'salt-3',
      codeAlgorithm: 'argon2id-test',
      createdAtUtc: '2026-07-29T13:00:00.000Z',
    });
  });

  it('creates an audit record for each initial account without credential data', async () => {
    await useCase.execute(input);

    expect(repository.saved?.auditRecords).toEqual([
      expectedAudit('audit-admin', 'user-admin', 'ADMINISTRADOR', 'administrador'),
      expectedAudit('audit-cashier', 'user-admin', 'CAJERO', 'caja principal'),
      {
        id: 'audit-recovery',
        actorUserId: 'user-admin',
        action: 'CREAR_CODIGO_RECUPERACION',
        entityType: 'CREDENCIAL_RECUPERACION',
        entityId: 'recovery-admin',
        newValues: { userId: 'user-admin', active: true },
        occurredAtUtc: '2026-07-29T13:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(repository.saved?.auditRecords)).not.toMatch(
      /password|contrasena|hash|salt/i,
    );
  });

  it('blocks provisioning permanently when any user already exists', async () => {
    repository.hasUsers = true;

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(InitialUsersAlreadyExistError);
    expect(passwordHasher.receivedPasswords).toHaveLength(0);
    expect(repository.saved).toBeUndefined();
  });

  it('rejects equal usernames after normalization', async () => {
    await expect(
      useCase.execute({
        ...input,
        cashier: { ...input.cashier, username: 'administrador' },
      }),
    ).rejects.toBeInstanceOf(DuplicateInitialUsernameError);
    expect(repository.saved).toBeUndefined();
  });

  it('validates both passwords before calculating either hash', async () => {
    await expect(
      useCase.execute({
        ...input,
        cashier: { ...input.cashier, password: '1234567' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD_LENGTH' });
    expect(passwordHasher.receivedPasswords).toHaveLength(0);
  });
});

function expectedUser(
  fields: Pick<
    NewUserRecord,
    | 'id'
    | 'role'
    | 'username'
    | 'normalizedUsername'
    | 'displayName'
    | 'passwordHash'
    | 'passwordSalt'
  >,
): NewUserRecord {
  return {
    ...fields,
    passwordAlgorithm: 'argon2id-test',
    active: true,
    createdAtUtc: '2026-07-29T13:00:00.000Z',
    updatedAtUtc: '2026-07-29T13:00:00.000Z',
  };
}

function expectedAudit(
  id: string,
  actorUserId: string,
  role: 'ADMINISTRADOR' | 'CAJERO',
  normalizedUsername: string,
): UserAuditRecord {
  return {
    id,
    actorUserId,
    action: 'CREAR_USUARIO_INICIAL',
    entityType: 'USUARIO',
    entityId: role === 'ADMINISTRADOR' ? 'user-admin' : 'user-cashier',
    newValues: {
      role,
      normalizedUsername,
      active: true,
    },
    occurredAtUtc: '2026-07-29T13:00:00.000Z',
  };
}
