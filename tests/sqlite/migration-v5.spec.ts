import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import { MIGRATION_V3 } from '../../src/app/core/database/migrations/migration-v3';
import { MIGRATION_V4 } from '../../src/app/core/database/migrations/migration-v4';
import {
  MIGRATION_V5,
  MIGRATION_V5_CHECKSUM,
  MIGRATION_V5_WORK_STATEMENTS,
} from '../../src/app/core/database/migrations/migration-v5';

describe('migration v5', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [
      MIGRATION_V1,
      MIGRATION_V2,
      MIGRATION_V3,
      MIGRATION_V4,
      MIGRATION_V5,
    ]) {
      for (const statement of migration.statements) database.exec(statement);
    }
  });

  afterEach(() => database.close());

  it('stores the approved display order for expense categories', () => {
    expect(
      database.prepare('SELECT codigo, orden FROM categorias_gasto ORDER BY orden').all(),
    ).toEqual([
      { codigo: 'INSUMOS', orden: 1 },
      { codigo: 'BEBIDAS', orden: 2 },
      { codigo: 'SERVICIOS', orden: 3 },
      { codigo: 'TRANSPORTE', orden: 4 },
      { codigo: 'MANTENIMIENTO', orden: 5 },
      { codigo: 'PERDIDA_CONSUMO_NO_COBRADO', orden: 6 },
      { codigo: 'OTROS', orden: 7 },
    ]);
  });

  it('records a reproducible migration checksum', () => {
    expect(createHash('sha256').update(MIGRATION_V5_WORK_STATEMENTS.join('\n')).digest('hex')).toBe(
      MIGRATION_V5_CHECKSUM,
    );
    expect(
      database
        .prepare('SELECT version, nombre, checksum FROM schema_version WHERE version = 5')
        .get(),
    ).toEqual({
      version: 5,
      nombre: 'expense_category_order',
      checksum: MIGRATION_V5_CHECKSUM,
    });
  });
});
