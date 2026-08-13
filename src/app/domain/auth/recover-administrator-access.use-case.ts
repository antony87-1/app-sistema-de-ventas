import type { PasswordCredential, PasswordHasher } from './password-credential.service';
import { PasswordPolicy } from './password-credential.service';
import type { IdentifierGenerator, UtcClock } from './provision-initial-users.use-case';
import { LocalRecoveryCodeService } from './recovery-code.service';

export interface AdministratorRecoveryRecord {
  readonly recoveryId: string;
  readonly userId: string;
  readonly credential: PasswordCredential;
}

export interface AdministratorRecoveryReplacement {
  readonly userId: string;
  readonly previousRecoveryId: string;
  readonly newRecoveryId: string;
  readonly auditId: string;
  readonly passwordCredential: PasswordCredential;
  readonly recoveryCredential: PasswordCredential;
  readonly occurredAtUtc: string;
}

export interface AdministratorRecoveryRepository {
  findActiveAdministratorRecovery(): Promise<AdministratorRecoveryRecord | null>;
  replacePasswordAndRecovery(replacement: AdministratorRecoveryReplacement): Promise<void>;
}

export class InvalidRecoveryCodeError extends Error {
  readonly code = 'INVALID_RECOVERY_CODE';

  constructor() {
    super('No se pudo recuperar el acceso. Verifica el código local.');
    this.name = 'InvalidRecoveryCodeError';
  }
}

export class RecoverAdministratorAccessUseCase {
  constructor(
    private readonly repository: AdministratorRecoveryRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly recoveryCodeService: LocalRecoveryCodeService,
    private readonly generateId: IdentifierGenerator,
    private readonly nowUtc: UtcClock,
  ) {}

  async execute(input: {
    readonly recoveryCode: string;
    readonly newPassword: string;
  }): Promise<{ readonly newRecoveryCode: string }> {
    this.passwordPolicy.assertValid(input.newPassword);
    const current = await this.repository.findActiveAdministratorRecovery();
    if (
      current === null ||
      !(await this.recoveryCodeService.verify(input.recoveryCode, current.credential))
    ) {
      throw new InvalidRecoveryCodeError();
    }

    const newRecoveryCode = this.recoveryCodeService.generate();
    const [passwordCredential, recoveryCredential] = await Promise.all([
      this.passwordHasher.hash(input.newPassword),
      this.recoveryCodeService.hash(newRecoveryCode),
    ]);

    await this.repository.replacePasswordAndRecovery({
      userId: current.userId,
      previousRecoveryId: current.recoveryId,
      newRecoveryId: this.generateId(),
      auditId: this.generateId(),
      passwordCredential,
      recoveryCredential,
      occurredAtUtc: this.nowUtc(),
    });

    return { newRecoveryCode };
  }
}
