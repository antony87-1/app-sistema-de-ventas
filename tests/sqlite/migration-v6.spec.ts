import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import {
  MIGRATION_V6_CHECKSUM,
  MIGRATION_V6_WORK_STATEMENTS,
} from '../../src/app/core/database/migrations/migration-v6';

describe('migration v6', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of DATABASE_MIGRATIONS)
      for (const statement of migration.statements) database.exec(statement);
  });

  afterEach(() => database.close());

  it('adds the journey where a scheduled order was delivered', () => {
    const columns = database.prepare("PRAGMA table_info('pedido_programado_datos')").all();
    expect(columns).toContainEqual(expect.objectContaining({ name: 'jornada_entrega_id' }));
    expect(database.prepare("PRAGMA index_list('pedido_programado_datos')").all()).toContainEqual(
      expect.objectContaining({ name: 'idx_pedido_programado_jornada_entrega' }),
    );
  });

  it('records a reproducible migration checksum', () => {
    expect(createHash('sha256').update(MIGRATION_V6_WORK_STATEMENTS.join('\n')).digest('hex')).toBe(
      MIGRATION_V6_CHECKSUM,
    );
    expect(
      database
        .prepare('SELECT version, nombre, checksum FROM schema_version WHERE version = 6')
        .get(),
    ).toEqual({
      version: 6,
      nombre: 'scheduled_order_delivery_journey',
      checksum: MIGRATION_V6_CHECKSUM,
    });
  });
});
