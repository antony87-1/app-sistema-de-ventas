import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteJourneyCloseBlockersRepository,
  type CloseBlockersQueryDatabase,
  type CloseBlockersQueryRow,
  type CloseBlockersQueryValue,
} from '../../src/app/core/cash/sqlite-journey-close-blockers.repository';
import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';

describe('SqliteJourneyCloseBlockersRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteJourneyCloseBlockersRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    for (const migration of DATABASE_MIGRATIONS) {
      for (const statement of migration.statements) database.exec(statement);
    }
    insertFixtures(database);
    repository = new SqliteJourneyCloseBlockersRepository(new NodeCloseBlockersDatabase(database));
  });

  afterEach(() => database.close());

  it('lists open tables and unpaid service accounts with identifying data', async () => {
    const blockers = await repository.listOperationalBlockers('journey-1');

    expect(blockers.openTables).toEqual([
      { operationId: 'account-paid', operationCode: 'CTA-1', tableName: 'Mesa 1' },
      { operationId: 'account-pending', operationCode: 'CTA-2', tableName: 'Mesa 2' },
    ]);
    expect(blockers.pendingAccounts).toEqual([
      { operationId: 'account-pending', operationCode: 'CTA-2', balanceCents: 4000 },
    ]);
  });

  it('does not block the daily close for a future scheduled order', async () => {
    expect(
      (await repository.listOperationalBlockers('journey-1')).pendingAccounts,
    ).not.toContainEqual(expect.objectContaining({ operationId: 'scheduled-order' }));
  });
});

class NodeCloseBlockersDatabase implements CloseBlockersQueryDatabase {
  constructor(private readonly database: DatabaseSync) {}
  async query(
    statement: string,
    values: readonly CloseBlockersQueryValue[] = [],
  ): Promise<readonly CloseBlockersQueryRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
}

function insertFixtures(database: DatabaseSync): void {
  const roleId = findId(database, 'roles', 'CAJERO');
  database
    .prepare(
      `INSERT INTO usuarios (
      id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
      contrasena_hash, contrasena_sal, contrasena_algoritmo, activo, creado_en_utc, actualizado_en_utc
    ) VALUES ('user-cashier', '${roleId}', 'Caja', 'caja', 'Caja', 'hash', 'salt', 'fixture', 1,
              '2026-07-29T14:00:00Z', '2026-07-29T14:00:00Z');`,
    )
    .run();
  database.exec(
    `INSERT INTO jornadas_caja (
      id, fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
      abierta_en_utc, clave_idempotencia, version
    ) VALUES ('journey-1', '2026-07-29', 'ABIERTA', 10000, 'user-cashier',
              '2026-07-29T14:00:00Z', 'journey-request', 1);`,
  );
  database.exec(
    `INSERT INTO mesas (id, codigo, nombre, orden, activo, creado_en_utc, actualizado_en_utc) VALUES
      ('table-1', 'MESA_1', 'Mesa 1', 1, 1, '2026-07-29T14:00:00Z', '2026-07-29T14:00:00Z'),
      ('table-2', 'MESA_2', 'Mesa 2', 2, 1, '2026-07-29T14:00:00Z', '2026-07-29T14:00:00Z');`,
  );
  insertOperation(database, 'account-paid', 'CTA-1', 'CUENTA_MESA', 'PAGADA', 5000, 5000);
  insertOperation(
    database,
    'account-pending',
    'CTA-2',
    'CUENTA_MESA',
    'PAGADA_PARCIALMENTE',
    5000,
    1000,
  );
  insertOperation(database, 'scheduled-order', 'PROG-1', 'PEDIDO_PROGRAMADO', 'ABIERTA', 8000, 0);
  database.exec(
    `INSERT INTO operacion_mesas (
      id, operacion_id, mesa_id, rol_mesa, vinculada_por_usuario_id, vinculada_en_utc
    ) VALUES
      ('link-1', 'account-paid', 'table-1', 'PRINCIPAL', 'user-cashier', '2026-07-29T14:10:00Z'),
      ('link-2', 'account-pending', 'table-2', 'PRINCIPAL', 'user-cashier', '2026-07-29T14:20:00Z');`,
  );
}

function insertOperation(
  database: DatabaseSync,
  id: string,
  code: string,
  type: 'CUENTA_MESA' | 'PEDIDO_PROGRAMADO',
  state: 'ABIERTA' | 'PAGADA_PARCIALMENTE' | 'PAGADA',
  totalCents: number,
  paidCents: number,
): void {
  database
    .prepare(
      `INSERT INTO operaciones (
        id, codigo, tipo, estado, jornada_creacion_id, creada_por_usuario_id, creada_en_utc,
        subtotal_catalogo_centimos, descuento_total_centimos, total_centimos,
        pagado_centimos, saldo_centimos, clave_idempotencia, version
      ) VALUES (?, ?, ?, ?, 'journey-1', 'user-cashier', '2026-07-29T14:00:00Z',
                ?, 0, ?, ?, ?, ?, 1);`,
    )
    .run(
      id,
      code,
      type,
      state,
      totalCents,
      totalCents,
      paidCents,
      totalCents - paidCents,
      `request-${id}`,
    );
}

function findId(database: DatabaseSync, table: string, code: string): string {
  return String(
    (database.prepare(`SELECT id FROM ${table} WHERE codigo = ?`).get(code) as { id: string }).id,
  );
}
