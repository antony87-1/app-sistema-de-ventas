import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import { SqliteAuthenticationRepository } from '../../src/app/core/auth/sqlite-authentication.repository';
import type {
  SqliteAuthDatabase,
  SqliteAuthRow,
  SqliteAuthValue,
} from '../../src/app/core/auth/sqlite-initial-users.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';

const NOW = '2026-07-29T15:00:00.000Z';

describe('SqliteAuthenticationRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteAuthenticationRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    insertAdministrator(database);
    repository = new SqliteAuthenticationRepository(new NodeSqliteAuthDatabase(database));
  });

  afterEach(() => database.close());

  it('loads the complete authentication record by normalized username', async () => {
    await expect(repository.findByNormalizedUsername('administrador')).resolves.toEqual({
      id: 'user-admin',
      role: 'ADMINISTRADOR',
      displayName: 'Administrador',
      active: true,
      credential: { algorithm: 'fixture', salt: 'salt', hash: 'correcta' },
      failedAttempts: 0,
      blockedUntilUtc: null,
    });
  });

  it('persists failed attempts and the temporary block', async () => {
    await repository.recordFailedAttempt('user-admin', 0, '2026-07-29T15:05:00.000Z', NOW);

    expect(
      database
        .prepare(
          `SELECT intentos_fallidos AS attempts, bloqueado_hasta_utc AS blockedUntilUtc,
                  ultimo_fallo_en_utc AS lastFailureAtUtc FROM usuarios WHERE id = 'user-admin'`,
        )
        .get(),
    ).toEqual({
      attempts: 0,
      blockedUntilUtc: '2026-07-29T15:05:00.000Z',
      lastFailureAtUtc: NOW,
    });
  });

  it('clears failed state and audits a successful login atomically', async () => {
    database
      .prepare(
        `UPDATE usuarios SET intentos_fallidos = 3, ultimo_fallo_en_utc = ? WHERE id = 'user-admin'`,
      )
      .run(NOW);

    await repository.recordSuccessfulLogin('user-admin', 'audit-login', NOW);

    expect(
      database
        .prepare(
          `SELECT intentos_fallidos AS attempts, bloqueado_hasta_utc AS blockedUntilUtc,
                  ultimo_fallo_en_utc AS lastFailureAtUtc FROM usuarios WHERE id = 'user-admin'`,
        )
        .get(),
    ).toEqual({ attempts: 0, blockedUntilUtc: null, lastFailureAtUtc: null });
    expect(
      database
        .prepare(`SELECT accion, entidad_tipo AS entityType, entidad_id AS entityId FROM auditoria`)
        .get(),
    ).toEqual({ accion: 'INICIAR_SESION', entityType: 'USUARIO', entityId: 'user-admin' });
  });
});

class NodeSqliteAuthDatabase implements SqliteAuthDatabase {
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

function insertAdministrator(database: DatabaseSync): void {
  const role = database.prepare("SELECT id FROM roles WHERE codigo = 'ADMINISTRADOR'").get() as {
    id: string;
  };
  database
    .prepare(
      `INSERT INTO usuarios (
        id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
        contrasena_hash, contrasena_sal, contrasena_algoritmo, activo, creado_en_utc, actualizado_en_utc
      ) VALUES ('user-admin', ?, 'Administrador', 'administrador', 'Administrador',
                'correcta', 'salt', 'fixture', 1, ?, ?)`,
    )
    .run(role.id, NOW, NOW);
}
