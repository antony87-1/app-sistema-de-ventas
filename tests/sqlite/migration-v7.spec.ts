import { DatabaseSync } from 'node:sqlite';

import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import { CUSTOM_SCHEDULED_PRODUCT_ID } from '../../src/app/core/database/migrations/migration-v7';

describe('migration v7', () => {
  it('registers the internal product used by written scheduled-order lines', () => {
    const database = new DatabaseSync(':memory:');
    for (const migration of DATABASE_MIGRATIONS)
      for (const statement of migration.statements) database.exec(statement);

    expect(
      database
        .prepare('SELECT codigo,precio_centimos FROM productos WHERE id=?')
        .get(CUSTOM_SCHEDULED_PRODUCT_ID),
    ).toEqual({ codigo: 'PEDIDO_PERSONALIZADO', precio_centimos: 0 });
    expect(database.prepare('SELECT nombre FROM schema_version WHERE version=7').get()).toEqual({
      nombre: 'custom_scheduled_order_lines',
    });
    database.close();
  });
});
