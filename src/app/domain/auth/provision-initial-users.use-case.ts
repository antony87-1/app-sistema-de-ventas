import type { UserRole } from './authorization-policy';
import type { PasswordHasher } from './password-credential.service';
import { PasswordPolicy } from './password-credential.service';
import type { LocalRecoveryCodeService } from './recovery-code.service';

export interface InitialUserInput {
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
}

export interface ProvisionInitialUsersInput {
  readonly administrator: InitialUserInput;
  readonly cashier: InitialUserInput;
}

export interface NewUserRecord {
  readonly id: string;
  readonly role: UserRole;
  readonly username: string;
  readonly normalizedUsername: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly passwordAlgorithm: string;
  readonly active: true;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
}

export interface UserAuditRecord {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: 'CREAR_USUARIO_INICIAL' | 'CREAR_CODIGO_RECUPERACION';
  readonly entityType: 'USUARIO' | 'CREDENCIAL_RECUPERACION';
  readonly entityId: string;
  readonly newValues: Readonly<Record<string, string | boolean>>;
  readonly occurredAtUtc: string;
}

export interface InitialUserProvisioning {
  readonly users: readonly [NewUserRecord, NewUserRecord];
  readonly recoveryCredential: RecoveryCredentialRecord;
  readonly auditRecords: readonly UserAuditRecord[];
}

export interface RecoveryCredentialRecord {
  readonly id: string;
  readonly userId: string;
  readonly codeHash: string;
  readonly codeSalt: string;
  readonly codeAlgorithm: string;
  readonly createdAtUtc: string;
}

export interface InitialUsersRepository {
  hasAnyUsers(): Promise<boolean>;
  provision(provisioning: InitialUserProvisioning): Promise<void>;
}

export type IdentifierGenerator = () => string;
export type UtcClock = () => string;

export class InitialUsersAlreadyExistError extends Error {
  readonly code = 'INITIAL_USERS_ALREADY_EXIST';

  constructor() {
    super('La configuración inicial de usuarios ya fue realizada.');
    this.name = 'InitialUsersAlreadyExistError';
  }
}

export class DuplicateInitialUsernameError extends Error {
  readonly code = 'DUPLICATE_INITIAL_USERNAME';

  constructor() {
    super('El administrador y el cajero deben tener nombres de usuario diferentes.');
    this.name = 'DuplicateInitialUsernameError';
  }
}

export class InvalidInitialUserDataError extends Error {
  readonly code = 'INVALID_INITIAL_USER_DATA';

  constructor() {
    super('Completa el nombre de usuario y el nombre visible.');
    this.name = 'InvalidInitialUserDataError';
  }
}

export class ProvisionInitialUsersUseCase {
  constructor(
    private readonly repository: InitialUsersRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly recoveryCodeService: LocalRecoveryCodeService,
    private readonly generateId: IdentifierGenerator,
    private readonly nowUtc: UtcClock,
  ) {}

  async execute(input: ProvisionInitialUsersInput): Promise<{
    readonly administratorId: string;
    readonly cashierId: string;
    readonly recoveryCode: string;
  }> {
    if (await this.repository.hasAnyUsers()) {
      throw new InitialUsersAlreadyExistError();
    }

    const administratorIdentity = normalizeIdentity(input.administrator);
    const cashierIdentity = normalizeIdentity(input.cashier);

    if (administratorIdentity.normalizedUsername === cashierIdentity.normalizedUsername) {
      throw new DuplicateInitialUsernameError();
    }

    this.passwordPolicy.assertValid(input.administrator.password);
    this.passwordPolicy.assertValid(input.cashier.password);

    const recoveryCode = this.recoveryCodeService.generate();
    const [administratorCredential, cashierCredential, recoveryCredential] = await Promise.all([
      this.passwordHasher.hash(input.administrator.password),
      this.passwordHasher.hash(input.cashier.password),
      this.recoveryCodeService.hash(recoveryCode),
    ]);

    const administratorId = this.generateId();
    const cashierId = this.generateId();
    const recoveryCredentialId = this.generateId();
    const administratorAuditId = this.generateId();
    const cashierAuditId = this.generateId();
    const recoveryAuditId = this.generateId();
    const occurredAtUtc = this.nowUtc();

    const administrator = createUserRecord(
      administratorId,
      'ADMINISTRADOR',
      administratorIdentity,
      administratorCredential,
      occurredAtUtc,
    );
    const cashier = createUserRecord(
      cashierId,
      'CAJERO',
      cashierIdentity,
      cashierCredential,
      occurredAtUtc,
    );

    await this.repository.provision({
      users: [administrator, cashier],
      recoveryCredential: {
        id: recoveryCredentialId,
        userId: administratorId,
        codeHash: recoveryCredential.hash,
        codeSalt: recoveryCredential.salt,
        codeAlgorithm: recoveryCredential.algorithm,
        createdAtUtc: occurredAtUtc,
      },
      auditRecords: [
        createAuditRecord(administratorAuditId, administratorId, administrator),
        createAuditRecord(cashierAuditId, administratorId, cashier),
        {
          id: recoveryAuditId,
          actorUserId: administratorId,
          action: 'CREAR_CODIGO_RECUPERACION',
          entityType: 'CREDENCIAL_RECUPERACION',
          entityId: recoveryCredentialId,
          newValues: { userId: administratorId, active: true },
          occurredAtUtc,
        },
      ],
    });

    return { administratorId, cashierId, recoveryCode };
  }
}

interface NormalizedIdentity {
  readonly username: string;
  readonly normalizedUsername: string;
  readonly displayName: string;
}

function normalizeIdentity(input: InitialUserInput): NormalizedIdentity {
  const username = input.username.trim().normalize('NFKC');
  const displayName = input.displayName.trim().normalize('NFKC');

  if (username.length === 0 || displayName.length === 0) {
    throw new InvalidInitialUserDataError();
  }

  return {
    username,
    normalizedUsername: username.toLocaleLowerCase('es-PE'),
    displayName,
  };
}

function createUserRecord(
  id: string,
  role: UserRole,
  identity: NormalizedIdentity,
  credential: Awaited<ReturnType<PasswordHasher['hash']>>,
  occurredAtUtc: string,
): NewUserRecord {
  return {
    id,
    role,
    username: identity.username,
    normalizedUsername: identity.normalizedUsername,
    displayName: identity.displayName,
    passwordHash: credential.hash,
    passwordSalt: credential.salt,
    passwordAlgorithm: credential.algorithm,
    active: true,
    createdAtUtc: occurredAtUtc,
    updatedAtUtc: occurredAtUtc,
  };
}

function createAuditRecord(id: string, actorUserId: string, user: NewUserRecord): UserAuditRecord {
  return {
    id,
    actorUserId,
    action: 'CREAR_USUARIO_INICIAL',
    entityType: 'USUARIO',
    entityId: user.id,
    newValues: {
      role: user.role,
      normalizedUsername: user.normalizedUsername,
      active: true,
    },
    occurredAtUtc: user.createdAtUtc,
  };
}
