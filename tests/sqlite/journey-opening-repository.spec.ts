import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteJourneyOpeningRepository,
  type JourneyWriteDatabase,
  type JourneyWriteRow,
  type JourneyWriteValue,
} from '../../src/app/core/journey/sqlite-journey-opening.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import { MIGRATION_V3 } from '../../src/app/core/database/migrations/migration-v3';
import {
  BusinessDateAlreadyHasJourneyError,
  IdempotencyConflictError,
  JourneyAlreadyOpenError,
  type JourneyOpeningCommand,
} from '../../src/app/domain/journey/open-journey.use-case';

const NOW = '2026-07-29T23:00:00.000Z';

describe('SqliteJourneyOpeningRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteJourneyOpeningRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    insertCashier(database);
    repository = new SqliteJourneyOpeningRepository(new NodeJourneyWriteDatabase(database));
  });

  afterEach(() => database.close());

  it('persists the journey and its audit atomically', async () => {
    await expect(repository.open(command())).resolves.toEqual({
      id: 'journey-1',
      businessDate: '2026-07-29',
      initialAmountCents: 10000,
      openedByUserId: 'user-cashier',
      openedByDisplayName: 'Caja',
      openedAtUtc: NOW,
    });
    expect(
      database
        .prepare(
          `SELECT fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
                  observacion_apertura, clave_idempotencia
             FROM jornadas_caja WHERE id = 'journey-1'`,
        )
        .get(),
    ).toEqual({
      fecha_negocio: '2026-07-29',
      estado: 'ABIERTA',
      monto_inicial_centimos: 10000,
      abierta_por_usuario_id: 'user-cashier',
      observacion_apertura: 'Inicio normal',
      clave_idempotencia: 'request-1',
    });
    expect(
      database
        .prepare(
          `SELECT usuario_id, jornada_id, accion, entidad_tipo, entidad_id,
                  valores_anteriores_json, valores_nuevos_json, ocurrido_en_utc
             FROM auditoria WHERE id = 'audit-1'`,
        )
        .get(),
    ).toEqual({
      usuario_id: 'user-cashier',
      jornada_id: 'journey-1',
      accion: 'ABRIR_JORNADA',
      entidad_tipo: 'JORNADA_CAJA',
      entidad_id: 'journey-1',
      valores_anteriores_json: null,
      valores_nuevos_json: JSON.stringify({
        fecha_negocio: '2026-07-29',
        estado: 'ABIERTA',
        monto_inicial_centimos: 10000,
        observacion_apertura: 'Inicio normal',
      }),
      ocurrido_en_utc: NOW,
    });
  });

  it('blocks opening when a previous-day journey remains open', async () => {
    insertJourney(database, { id: 'journey-old', date: '2026-07-28', state: 'ABIERTA' });

    await expect(repository.open(command())).rejects.toBeInstanceOf(JourneyAlreadyOpenError);
    expect(database.prepare('SELECT COUNT(*) AS total FROM jornadas_caja').get()).toEqual({
      total: 1,
    });
    expect(database.prepare('SELECT COUNT(*) AS total FROM auditoria').get()).toEqual({ total: 0 });
  });

  it('blocks a second opening for a business date already closed', async () => {
    insertJourney(database, { id: 'journey-closed', date: '2026-07-29', state: 'CERRADA' });

    await expect(repository.open(command())).rejects.toBeInstanceOf(
      BusinessDateAlreadyHasJourneyError,
    );
    expect(database.prepare('SELECT COUNT(*) AS total FROM auditoria').get()).toEqual({ total: 0 });
  });

  it('returns the original result for an identical idempotent retry without another audit', async () => {
    const first = await repository.open(command());
    const retry = await repository.open({
      ...command(),
      journeyId: 'journey-retry',
      auditId: 'audit-retry',
    });

    expect(retry).toEqual(first);
    expect(database.prepare('SELECT COUNT(*) AS total FROM jornadas_caja').get()).toEqual({
      total: 1,
    });
    expect(database.prepare('SELECT COUNT(*) AS total FROM auditoria').get()).toEqual({ total: 1 });
  });

  it('rejects reuse of an idempotency key with different data', async () => {
    await repository.open(command());

    await expect(
      repository.open({
        ...command(),
        journeyId: 'journey-2',
        auditId: 'audit-2',
        initialAmountCents: 20000,
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(database.prepare('SELECT COUNT(*) AS total FROM jornadas_caja').get()).toEqual({
      total: 1,
    });
  });

  it('rolls back the journey when the audit insert fails', async () => {
    insertConflictingAudit(database);

    await expect(repository.open(command())).rejects.toThrow();
    expect(database.prepare('SELECT COUNT(*) AS total FROM jornadas_caja').get()).toEqual({
      total: 0,
    });
  });
});

class NodeJourneyWriteDatabase implements JourneyWriteDatabase {
  private transactionActive = false;

  constructor(private readonly database: DatabaseSync) {}

  async query(
    statement: string,
    values: readonly JourneyWriteValue[] = [],
  ): Promise<readonly JourneyWriteRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }

  async run(statement: string, values: readonly JourneyWriteValue[] = []): Promise<void> {
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

function command(): JourneyOpeningCommand {
  return {
    journeyId: 'journey-1',
    auditId: 'audit-1',
    businessDate: '2026-07-29',
    initialAmountCents: 10000,
    observation: 'Inicio normal',
    idempotencyKey: 'request-1',
    actorUserId: 'user-cashier',
    openedAtUtc: NOW,
  };
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
    .run(role.id, NOW, NOW);
}

function insertJourney(
  database: DatabaseSync,
  input: { id: string; date: string; state: 'ABIERTA' | 'CERRADA' },
): void {
  database
    .prepare(
      `INSERT INTO jornadas_caja (
        id, fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
        abierta_en_utc, clave_idempotencia, version
      ) VALUES (?, ?, ?, 0, 'user-cashier', ?, ?, 1);`,
    )
    .run(input.id, input.date, input.state, NOW, `request-${input.id}`);
}

function insertConflictingAudit(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO auditoria (
        id, usuario_id, accion, entidad_tipo, entidad_id, ocurrido_en_utc
      ) VALUES ('audit-1', 'user-cashier', 'FIXTURE', 'USUARIO', 'user-cashier', ?);`,
    )
    .run(NOW);
}
