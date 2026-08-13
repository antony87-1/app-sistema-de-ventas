import type { PasswordCredential, PasswordHasher } from './password-credential.service';
import { PasswordPolicy } from './password-credential.service';
import {
  InvalidRecoveryCodeError,
  RecoverAdministratorAccessUseCase,
  type AdministratorRecoveryRepository,
  type AdministratorRecoveryReplacement,
} from './recover-administrator-access.use-case';
import { LocalRecoveryCodeService } from './recovery-code.service';

class FixtureHasher implements PasswordHasher {
  async hash(value: string): Promise<PasswordCredential> {
    return { algorithm: 'fixture', salt: `salt:${value}`, hash: `hash:${value}` };
  }
  async verify(value: string, credential: PasswordCredential): Promise<boolean> {
    return credential.hash === `hash:${value}`;
  }
}

class FixtureRepository implements AdministratorRecoveryRepository {
  replacement?: AdministratorRecoveryReplacement;
  async findActiveAdministratorRecovery() {
    return {
      recoveryId: 'recovery-old',
      userId: 'user-admin',
      credential: {
        algorithm: 'fixture',
        salt: 'salt:CODIGOANTERIOR',
        hash: 'hash:CODIGOANTERIOR',
      },
    };
  }
  async replacePasswordAndRecovery(replacement: AdministratorRecoveryReplacement): Promise<void> {
    this.replacement = replacement;
  }
}

describe('RecoverAdministratorAccessUseCase', () => {
  let repository: FixtureRepository;
  let useCase: RecoverAdministratorAccessUseCase;

  beforeEach(() => {
    repository = new FixtureRepository();
    const hasher = new FixtureHasher();
    const ids = ['recovery-new', 'audit-recovery'];
    useCase = new RecoverAdministratorAccessUseCase(
      repository,
      hasher,
      new PasswordPolicy(),
      new LocalRecoveryCodeService(hasher, () => new Uint8Array(24)),
      () => ids.shift() ?? expect.fail('Unexpected identifier request.'),
      () => '2026-07-29T16:00:00.000Z',
    );
  });

  it('replaces the password and rotates the one-time recovery code', async () => {
    const result = await useCase.execute({
      recoveryCode: 'codigo-anterior',
      newPassword: 'nueva-clave-segura',
    });

    expect(result).toEqual({ newRecoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA' });
    expect(repository.replacement).toMatchObject({
      userId: 'user-admin',
      previousRecoveryId: 'recovery-old',
      newRecoveryId: 'recovery-new',
      auditId: 'audit-recovery',
      occurredAtUtc: '2026-07-29T16:00:00.000Z',
      passwordCredential: { hash: 'hash:nueva-clave-segura' },
      recoveryCredential: { hash: 'hash:AAAAAAAAAAAAAAAAAAAAAAAA' },
    });
  });

  it('does not reveal whether a recovery record exists or the code was wrong', async () => {
    await expect(
      useCase.execute({ recoveryCode: 'incorrecto', newPassword: 'nueva-clave-segura' }),
    ).rejects.toBeInstanceOf(InvalidRecoveryCodeError);
    expect(repository.replacement).toBeUndefined();
  });

  it('validates the new password before changing data', async () => {
    await expect(
      useCase.execute({ recoveryCode: 'codigo-anterior', newPassword: 'corta' }),
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD_LENGTH' });
    expect(repository.replacement).toBeUndefined();
  });
});
