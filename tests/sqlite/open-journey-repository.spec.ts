import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteOpenJourneyRepository,
  type JourneyQueryDatabase,
  type JourneyQueryRow,
  type JourneyQueryValue,
} from '../../src/app/core/journey/sqlite-open-journey.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import { MIGRATION_V3 } from '../../src/app/core/database/migrations/migration-v3';

const OPENED_AT = '2026-07-29T14:00:00.000Z';

describe('SqliteOpenJourneyRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteOpenJourneyRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    insertCashier(database);
    repository = new SqliteOpenJourneyRepository(new NodeJourneyDatabase(database));
  });

  afterEach(() => database.close());

  it('returns null when no journey is open', async () => {
    await expect(repository.findOpen()).resolves.toBeNull();
  });

  it('loads the only open journey with its opening user', async () => {
    insertJourney(database, 'ABIERTA');

    await expect(repository.findOpen()).resolves.toEqual({
      id: 'journey-1',
      businessDate: '2026-07-29',
      initialAmountCents: 10000,
      openedByUserId: 'user-cashier',
      openedByDisplayName: 'Caja',
      openedAtUtc: OPENED_AT,
    });
  });

  it('ignores closed historical journeys', async () => {
    insertJourney(database, 'CERRADA');

    await expect(repository.findOpen()).resolves.toBeNull();
  });
});

class NodeJourneyDatabase implements JourneyQueryDatabase {
  constructor(private readonly database: DatabaseSync) {}

  async query(
    statement: string,
    values: readonly JourneyQueryValue[] = [],
  ): Promise<readonly JourneyQueryRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
}

function insertCashier(database: DatabaseSync): void {
  const role = database.prepare("SELECT id FROM roles WHERE codigo = 'CAJERO'").get() as {
    id: string;
  };
  database
    .prepare(
      `INSERT INTO usuarios (
      id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
      contrasena_hash, contrasena_sal, contrasena_algoritmo, activo,
      creado_en_utc, actualizado_en_utc
    ) VALUES ('user-cashier', ?, 'Caja', 'caja', 'Caja', 'hash', 'salt', 'fixture', 1, ?, ?);`,
    )
    .run(role.id, OPENED_AT, OPENED_AT);
}

function insertJourney(database: DatabaseSync, state: 'ABIERTA' | 'CERRADA'): void {
  database
    .prepare(
      `INSERT INTO jornadas_caja (
      id, fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
      abierta_en_utc, clave_idempotencia, version
    ) VALUES ('journey-1', '2026-07-29', ?, 10000, 'user-cashier', ?, 'journey-key', 1);`,
    )
    .run(state, OPENED_AT);
}
