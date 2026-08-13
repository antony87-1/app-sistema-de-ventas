import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import {
  MIGRATION_V2,
  MIGRATION_V2_CHECKSUM,
  MIGRATION_V2_SCHEMA_STATEMENTS,
} from '../../src/app/core/database/migrations/migration-v2';

const NOW = '2026-07-29T15:00:00.000Z';

describe('migration v2', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const statement of MIGRATION_V1.statements) database.exec(statement);
  });

  afterEach(() => database.close());

  it('upgrades existing users without losing credentials', () => {
    insertAdministrator(database);

    for (const statement of MIGRATION_V2.statements) database.exec(statement);

    expect(
      database
        .prepare(
          `SELECT nombre_usuario AS username, contrasena_hash AS passwordHash,
                  intentos_fallidos AS failedAttempts, bloqueado_hasta_utc AS blockedUntilUtc,
                  ultimo_fallo_en_utc AS lastFailureAtUtc
             FROM usuarios WHERE id = 'user-admin'`,
        )
        .get(),
    ).toEqual({
      username: 'Administrador',
      passwordHash: 'existing-hash',
      failedAttempts: 0,
      blockedUntilUtc: null,
      lastFailureAtUtc: null,
    });
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('creates one active recovery credential per administrator', () => {
    insertAdministrator(database);
    for (const statement of MIGRATION_V2.statements) database.exec(statement);

    database
      .prepare(
        `INSERT INTO credenciales_recuperacion (
           id, usuario_id, codigo_hash, codigo_sal, codigo_algoritmo, creado_en_utc
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('recovery-1', 'user-admin', 'hash', 'salt', 'argon2id', NOW);

    expect(() =>
      database
        .prepare(
          `INSERT INTO credenciales_recuperacion (
             id, usuario_id, codigo_hash, codigo_sal, codigo_algoritmo, creado_en_utc
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('recovery-2', 'user-admin', 'hash-2', 'salt-2', 'argon2id', NOW),
    ).toThrow();

    database
      .prepare(`UPDATE credenciales_recuperacion SET usado_en_utc = ? WHERE id = 'recovery-1'`)
      .run(NOW);
    expect(() =>
      database
        .prepare(
          `INSERT INTO credenciales_recuperacion (
             id, usuario_id, codigo_hash, codigo_sal, codigo_algoritmo, creado_en_utc
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('recovery-2', 'user-admin', 'hash-2', 'salt-2', 'argon2id', NOW),
    ).not.toThrow();
  });

  it('records a reproducible checksum for schema version 2', () => {
    for (const statement of MIGRATION_V2.statements) database.exec(statement);

    const calculatedChecksum = createHash('sha256')
      .update(MIGRATION_V2_SCHEMA_STATEMENTS.join('\n'))
      .digest('hex');
    expect(calculatedChecksum).toBe(MIGRATION_V2_CHECKSUM);
    expect(
      database
        .prepare('SELECT version, nombre, checksum FROM schema_version WHERE version = 2')
        .get(),
    ).toEqual({
      version: 2,
      nombre: 'authentication_security',
      checksum: MIGRATION_V2_CHECKSUM,
    });
  });
});

function insertAdministrator(database: DatabaseSync): void {
  const role = database.prepare("SELECT id FROM roles WHERE codigo = 'ADMINISTRADOR'").get() as {
    id: string;
  };
  database
    .prepare(
      `INSERT INTO usuarios (
         id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
         contrasena_hash, contrasena_sal, contrasena_algoritmo, activo,
         creado_en_utc, actualizado_en_utc
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      'user-admin',
      role.id,
      'Administrador',
      'administrador',
      'Administrador',
      'existing-hash',
      'existing-salt',
      'argon2id',
      NOW,
      NOW,
    );
}
