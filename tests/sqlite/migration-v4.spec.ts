import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import { MIGRATION_V3 } from '../../src/app/core/database/migrations/migration-v3';
import {
  MIGRATION_V4,
  MIGRATION_V4_CHECKSUM,
  MIGRATION_V4_DATA_STATEMENTS,
} from '../../src/app/core/database/migrations/migration-v4';

describe('migration v4', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4]) {
      for (const statement of migration.statements) database.exec(statement);
    }
  });

  afterEach(() => database.close());

  it('seeds exactly the seven approved active expense categories', () => {
    expect(
      database.prepare('SELECT codigo, nombre, activo FROM categorias_gasto ORDER BY rowid').all(),
    ).toEqual([
      { codigo: 'INSUMOS', nombre: 'Compra de insumos', activo: 1 },
      { codigo: 'BEBIDAS', nombre: 'Compra de bebidas', activo: 1 },
      { codigo: 'SERVICIOS', nombre: 'Servicios', activo: 1 },
      { codigo: 'TRANSPORTE', nombre: 'Transporte', activo: 1 },
      { codigo: 'MANTENIMIENTO', nombre: 'Mantenimiento', activo: 1 },
      {
        codigo: 'PERDIDA_CONSUMO_NO_COBRADO',
        nombre: 'Pérdida o consumo no cobrado',
        activo: 1,
      },
      { codigo: 'OTROS', nombre: 'Otros', activo: 1 },
    ]);
  });

  it('is data-idempotent and records its reproducible checksum', () => {
    for (const statement of MIGRATION_V4.statements) database.exec(statement);

    expect(database.prepare('SELECT COUNT(*) AS total FROM categorias_gasto').get()).toEqual({
      total: 7,
    });
    expect(createHash('sha256').update(MIGRATION_V4_DATA_STATEMENTS.join('\n')).digest('hex')).toBe(
      MIGRATION_V4_CHECKSUM,
    );
    expect(
      database
        .prepare('SELECT version, nombre, checksum FROM schema_version WHERE version = 4')
        .get(),
    ).toEqual({
      version: 4,
      nombre: 'expense_categories',
      checksum: MIGRATION_V4_CHECKSUM,
    });
  });
});
