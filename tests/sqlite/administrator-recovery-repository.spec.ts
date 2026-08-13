import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import { SqliteAdministratorRecoveryRepository } from '../../src/app/core/auth/sqlite-administrator-recovery.repository';
import type {
  SqliteAuthDatabase,
  SqliteAuthRow,
  SqliteAuthValue,
} from '../../src/app/core/auth/sqlite-initial-users.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';

const NOW = '2026-07-29T16:00:00.000Z';

describe('SqliteAdministratorRecoveryRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteAdministratorRecoveryRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    seedAdministrator(database);
    repository = new SqliteAdministratorRecoveryRepository(new NodeDatabase(database));
  });
  afterEach(() => database.close());

  it('loads only the active administrator recovery credential', async () => {
    await expect(repository.findActiveAdministratorRecovery()).resolves.toEqual({
      recoveryId: 'recovery-old',
      userId: 'user-admin',
      credential: { algorithm: 'fixture', salt: 'old-salt', hash: 'old-hash' },
    });
  });

  it('uses the previous code, changes the password, rotates the code and audits atomically', async () => {
    await repository.replacePasswordAndRecovery({
      userId: 'user-admin',
      previousRecoveryId: 'recovery-old',
      newRecoveryId: 'recovery-new',
      auditId: 'audit-recovery',
      passwordCredential: {
        algorithm: 'argon2id-new',
        salt: 'password-salt',
        hash: 'password-hash',
      },
      recoveryCredential: {
        algorithm: 'argon2id-new',
        salt: 'recovery-salt',
        hash: 'recovery-hash',
      },
      occurredAtUtc: NOW,
    });

    expect(
      database
        .prepare(`SELECT contrasena_hash AS hash, intentos_fallidos AS attempts FROM usuarios`)
        .get(),
    ).toEqual({
      hash: 'password-hash',
      attempts: 0,
    });
    expect(
      database
        .prepare(`SELECT id, usado_en_utc AS usedAtUtc FROM credenciales_recuperacion ORDER BY id`)
        .all(),
    ).toEqual([
      { id: 'recovery-new', usedAtUtc: null },
      { id: 'recovery-old', usedAtUtc: NOW },
    ]);
    expect(database.prepare(`SELECT accion FROM auditoria`).get()).toEqual({
      accion: 'RECUPERAR_ACCESO_ADMINISTRADOR',
    });
  });
});

class NodeDatabase implements SqliteAuthDatabase {
  private transactionActive = false;
  constructor(private readonly database: DatabaseSync) {}
  async query(
    statement: string,
    values: readonly SqliteAuthValue[] = [],
  ): Promise<readonly SqliteAuthRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
  async run(statement: string, values: readonly SqliteAuthValue[] = []): Promise<void> {
    this.database.prepare(statement).run(...([...values] as SQLInputValue[]));
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
    if (this.transactionActive) this.database.exec('ROLLBACK;');
    this.transactionActive = false;
  }
}

function seedAdministrator(database: DatabaseSync): void {
  const role = database.prepare("SELECT id FROM roles WHERE codigo = 'ADMINISTRADOR'").get() as {
    id: string;
  };
  database
    .prepare(
      `INSERT INTO usuarios (
    id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
    contrasena_hash, contrasena_sal, contrasena_algoritmo, activo, creado_en_utc, actualizado_en_utc
  ) VALUES ('user-admin', ?, 'Administrador', 'administrador', 'Administrador',
            'password-old', 'salt-old', 'fixture', 1, ?, ?);`,
    )
    .run(role.id, NOW, NOW);
  database
    .prepare(
      `INSERT INTO credenciales_recuperacion (
    id, usuario_id, codigo_hash, codigo_sal, codigo_algoritmo, creado_en_utc
  ) VALUES ('recovery-old', 'user-admin', 'old-hash', 'old-salt', 'fixture', ?);`,
    )
    .run(NOW);
}
