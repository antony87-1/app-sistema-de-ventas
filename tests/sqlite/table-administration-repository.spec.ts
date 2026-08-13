import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import { SqliteTableAdministrationRepository } from '../../src/app/core/table/sqlite-table-administration.repository';
import type {
  QuickSaleDatabase,
  QuickSaleRow,
  QuickSaleValue,
} from '../../src/app/core/sale/sqlite-quick-sale.repository';

describe('SQLite table administration repository', () => {
  it('creates and updates a table while preserving an audit trail', async () => {
    const database = setup();
    const repository = new SqliteTableAdministrationRepository(new NodeDatabase(database));
    await repository.save(command('Mesa terraza', true, 'audit-1'));
    await repository.save({ ...command('Mesa terraza 1', true, 'audit-2'), code: '' });

    expect(await repository.list()).toEqual([
      expect.objectContaining({ id: 'table-new', name: 'Mesa terraza 1', active: true }),
    ]);
    expect(database.prepare('SELECT COUNT(*) AS total FROM auditoria').get()).toEqual({ total: 2 });
    database.close();
  });

  it('deactivates without deleting the table', async () => {
    const database = setup();
    const repository = new SqliteTableAdministrationRepository(new NodeDatabase(database));
    await repository.save(command('Mesa 1', true, 'audit-1'));
    await repository.save({ ...command('Mesa 1', false, 'audit-2'), code: '' });
    expect(database.prepare("SELECT activo FROM mesas WHERE id='table-new'").get()).toEqual({
      activo: 0,
    });
    database.close();
  });
});

function command(name: string, active: boolean, auditId: string) {
  return {
    id: 'table-new',
    code: 'MESA-NEW',
    name,
    order: 1,
    active,
    actorUserId: 'admin',
    occurredAtUtc: '2026-07-31T10:00:00Z',
    auditId,
  };
}
function setup(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON;');
  for (const migration of DATABASE_MIGRATIONS)
    for (const statement of migration.statements) database.exec(statement);
  const role = database.prepare("SELECT id FROM roles WHERE codigo='ADMINISTRADOR'").get() as {
    id: string;
  };
  database
    .prepare(
      `INSERT INTO usuarios
      (id,rol_id,nombre_usuario,nombre_usuario_normalizado,nombre_mostrar,contrasena_hash,
       contrasena_sal,contrasena_algoritmo,activo,creado_en_utc,actualizado_en_utc)
      VALUES ('admin',?,'admin','admin','Admin','h','s','x',1,'now','now')`,
    )
    .run(role.id);
  return database;
}
class NodeDatabase implements QuickSaleDatabase {
  constructor(private readonly database: DatabaseSync) {}
  async query(
    sql: string,
    values: readonly QuickSaleValue[] = [],
  ): Promise<readonly QuickSaleRow[]> {
    return this.database
      .prepare(sql)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
  async run(sql: string, values: readonly QuickSaleValue[] = []): Promise<void> {
    this.database.prepare(sql).run(...([...values] as SQLInputValue[]));
  }
  async beginTransaction(): Promise<void> {
    this.database.exec('BEGIN IMMEDIATE');
  }
  async commitTransaction(): Promise<void> {
    this.database.exec('COMMIT');
  }
  async rollbackTransaction(): Promise<void> {
    this.database.exec('ROLLBACK');
  }
}
