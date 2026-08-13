import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import {
  InitialUsersAlreadyExistError,
  ProvisionInitialUsersUseCase,
} from '../../src/app/domain/auth/provision-initial-users.use-case';
import type {
  PasswordCredential,
  PasswordHasher,
} from '../../src/app/domain/auth/password-credential.service';
import { PasswordPolicy } from '../../src/app/domain/auth/password-credential.service';
import { LocalRecoveryCodeService } from '../../src/app/domain/auth/recovery-code.service';
import {
  SqliteInitialUsersRepository,
  type SqliteAuthDatabase,
  type SqliteAuthRow,
  type SqliteAuthValue,
} from '../../src/app/core/auth/sqlite-initial-users.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';

class NodeSqliteAuthDatabase implements SqliteAuthDatabase {
  failAuditInsert = false;
  private transactionActive = false;

  constructor(private readonly database: DatabaseSync) {}

  async query(
    statement: string,
    values: readonly SqliteAuthValue[] = [],
  ): Promise<readonly SqliteAuthRow[]> {
    return this.database
      .prepare(statement)
      .all(...toNodeValues(values))
      .map((row) => ({ ...row }));
  }

  async run(statement: string, values: readonly SqliteAuthValue[] = []): Promise<void> {
    if (this.failAuditInsert && statement.includes('INSERT INTO auditoria')) {
      throw new Error('Simulated audit failure.');
    }

    this.database.prepare(statement).run(...toNodeValues(values));
  }

  async beginTransaction(): Promise<void> {
    this.database.exec('BEGIN IMMEDIATE;');
    this.transactionActive = true;
  }

  async commitTransaction(): Promise<void> {
    this.database.exec('COMMIT;');
    this.transactionActive = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (this.transactionActive) {
      this.database.exec('ROLLBACK;');
      this.transactionActive = false;
    }
  }
}

class FixturePasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<PasswordCredential> {
    return {
      algorithm: 'argon2id-fixture',
      salt: password.startsWith('admin') ? 'admin-salt' : 'cashier-salt',
      hash: password.startsWith('admin') ? 'admin-hash' : 'cashier-hash',
    };
  }

  async verify(): Promise<boolean> {
    return false;
  }
}

describe('SqliteInitialUsersRepository', () => {
  let database: DatabaseSync;
  let databasePort: NodeSqliteAuthDatabase;
  let useCase: ProvisionInitialUsersUseCase;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');

    for (const statement of MIGRATION_V1.statements) {
      database.exec(statement);
    }
    for (const statement of MIGRATION_V2.statements) {
      database.exec(statement);
    }

    databasePort = new NodeSqliteAuthDatabase(database);
    const repository = new SqliteInitialUsersRepository(databasePort);
    const ids = [
      'user-admin',
      'user-cashier',
      'recovery-admin',
      'audit-admin',
      'audit-cashier',
      'audit-recovery',
    ];
    const hasher = new FixturePasswordHasher();
    useCase = new ProvisionInitialUsersUseCase(
      repository,
      hasher,
      new PasswordPolicy(),
      new LocalRecoveryCodeService(hasher, () => new Uint8Array(24)),
      () => ids.shift() ?? expect.fail('Unexpected identifier request.'),
      () => '2026-07-29T14:00:00.000Z',
    );
  });

  afterEach(() => database.close());

  it('persists one administrator, one cashier and their audit records', async () => {
    await useCase.execute(initialUsersInput());

    expect(
      database
        .prepare(
          `SELECT r.codigo AS role, u.nombre_usuario AS username,
                  u.nombre_usuario_normalizado AS normalizedUsername,
                  u.contrasena_hash AS passwordHash, u.contrasena_sal AS passwordSalt,
                  u.contrasena_algoritmo AS passwordAlgorithm, u.activo AS active
             FROM usuarios u
             JOIN roles r ON r.id = u.rol_id
            ORDER BY r.codigo`,
        )
        .all(),
    ).toEqual([
      {
        role: 'ADMINISTRADOR',
        username: 'Administrador',
        normalizedUsername: 'administrador',
        passwordHash: 'admin-hash',
        passwordSalt: 'admin-salt',
        passwordAlgorithm: 'argon2id-fixture',
        active: 1,
      },
      {
        role: 'CAJERO',
        username: 'Caja Principal',
        normalizedUsername: 'caja principal',
        passwordHash: 'cashier-hash',
        passwordSalt: 'cashier-salt',
        passwordAlgorithm: 'argon2id-fixture',
        active: 1,
      },
    ]);

    const audits = database
      .prepare(
        `SELECT usuario_id AS actorUserId, accion, entidad_tipo AS entityType,
                entidad_id AS entityId, valores_nuevos_json AS newValuesJson
           FROM auditoria
          ORDER BY id`,
      )
      .all();
    expect(audits).toHaveLength(3);
    expect(audits.every((audit) => audit['actorUserId'] === 'user-admin')).toBe(true);
    expect(audits.map((audit) => audit['accion'])).toEqual([
      'CREAR_USUARIO_INICIAL',
      'CREAR_USUARIO_INICIAL',
      'CREAR_CODIGO_RECUPERACION',
    ]);
    expect(JSON.stringify(audits)).not.toMatch(/admin-123|cajero-123|hash|salt/i);
    expect(
      database
        .prepare(
          `SELECT usuario_id AS userId, codigo_hash AS codeHash,
                  codigo_sal AS codeSalt, codigo_algoritmo AS codeAlgorithm
             FROM credenciales_recuperacion`,
        )
        .get(),
    ).toEqual({
      userId: 'user-admin',
      codeHash: 'cashier-hash',
      codeSalt: 'cashier-salt',
      codeAlgorithm: 'argon2id-fixture',
    });
  });

  it('blocks a second provisioning even when the existing users are inactive', async () => {
    await useCase.execute(initialUsersInput());
    database.prepare('UPDATE usuarios SET activo = 0').run();

    await expect(useCase.execute(initialUsersInput())).rejects.toBeInstanceOf(
      InitialUsersAlreadyExistError,
    );
    expect(database.prepare('SELECT COUNT(*) AS total FROM usuarios').get()).toEqual({
      total: 2,
    });
  });

  it('rolls back both users when an audit insert fails', async () => {
    databasePort.failAuditInsert = true;

    await expect(useCase.execute(initialUsersInput())).rejects.toThrow('Simulated audit failure.');
    expect(database.prepare('SELECT COUNT(*) AS total FROM usuarios').get()).toEqual({
      total: 0,
    });
    expect(database.prepare('SELECT COUNT(*) AS total FROM auditoria').get()).toEqual({
      total: 0,
    });
  });

  it('rolls back provisioning when an approved role is missing', async () => {
    database.prepare("DELETE FROM roles WHERE codigo = 'CAJERO'").run();

    await expect(useCase.execute(initialUsersInput())).rejects.toMatchObject({
      code: 'REQUIRED_INITIAL_ROLE_MISSING',
    });
    expect(database.prepare('SELECT COUNT(*) AS total FROM usuarios').get()).toEqual({
      total: 0,
    });
  });
});

function initialUsersInput() {
  return {
    administrator: {
      username: 'Administrador',
      displayName: 'Dueño del negocio',
      password: 'admin-123',
    },
    cashier: {
      username: 'Caja Principal',
      displayName: 'Caja principal',
      password: 'cajero-123',
    },
  } as const;
}

function toNodeValues(values: readonly SqliteAuthValue[]): SQLInputValue[] {
  return [...values];
}
