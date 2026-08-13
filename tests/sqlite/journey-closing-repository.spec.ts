import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';
import {
  SqliteJourneyClosingRepository,
  type JourneyCloseWriteDatabase,
  type JourneyCloseWriteRow,
  type JourneyCloseWriteValue,
} from '../../src/app/core/cash/sqlite-journey-closing.repository';
import { JourneyCloseBlockedError } from '../../src/app/domain/cash/close-journey.use-case';
import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import { SqliteJourneyReopeningRepository } from '../../src/app/core/journey/sqlite-journey-reopening.repository';
import { JourneyReopeningIdempotencyConflictError } from '../../src/app/domain/journey/reopen-journey.use-case';

describe('SqliteJourneyClosingRepository', () => {
  let db: DatabaseSync;
  let repository: SqliteJourneyClosingRepository;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    for (const migration of DATABASE_MIGRATIONS)
      for (const sql of migration.statements) db.exec(sql);
    insertUserAndJourney(db);
    repository = new SqliteJourneyClosingRepository(new NodeCloseDatabase(db));
  });
  afterEach(() => db.close());

  it('stores one closure and audit and closes the journey idempotently', async () => {
    const first = await repository.closeNormal(command());
    const repeated = await repository.closeNormal(command());
    expect(repeated).toEqual(first);
    expect(db.prepare('SELECT estado FROM jornadas_caja').get()).toEqual({ estado: 'CERRADA' });
    expect(db.prepare('SELECT COUNT(*) AS total FROM cierres_jornada').get()).toEqual({ total: 1 });
    expect(
      db.prepare("SELECT accion FROM auditoria WHERE entidad_tipo = 'CIERRE_JORNADA'").get(),
    ).toEqual({ accion: 'CERRAR_JORNADA' });
  });

  it('rolls back when an open table appears before confirmation', async () => {
    insertOpenAccount(db);
    await expect(repository.closeNormal(command())).rejects.toBeInstanceOf(
      JourneyCloseBlockedError,
    );
    expect(db.prepare('SELECT COUNT(*) AS total FROM cierres_jornada').get()).toEqual({ total: 0 });
    expect(db.prepare('SELECT estado FROM jornadas_caja').get()).toEqual({ estado: 'ABIERTA' });
  });

  it('stores a justified exceptional close for a previous business day', async () => {
    const result = await repository.closeExceptional({
      ...command(),
      justification: 'La jornada quedó pendiente por corte eléctrico',
      currentBusinessDate: '2026-07-30',
    });
    expect(result.businessDate).toBe('2026-07-29');
    expect(db.prepare('SELECT tipo FROM cierres_jornada').get()).toEqual({ tipo: 'EXCEPCIONAL' });
    expect(
      db.prepare("SELECT accion FROM auditoria WHERE entidad_tipo='CIERRE_JORNADA'").get(),
    ).toEqual({ accion: 'CERRAR_JORNADA_EXCEPCIONAL' });
  });

  it('reopens the latest close without deleting it and writes an audit', async () => {
    await repository.closeNormal(command());
    const reopening = new SqliteJourneyReopeningRepository(new NodeCloseDatabase(db));
    const candidate = await reopening.findLatestCandidate();
    const result = await reopening.reopen({
      reopeningId: 'reopen-1',
      auditId: 'audit-reopen',
      closeId: candidate!.closeId,
      reason: 'Corregir conteo',
      actorUserId: 'cashier',
      idempotencyKey: 'reopen-key',
      reopenedAtUtc: '2026-07-29T22:10:00Z',
    });
    expect(result.reason).toBe('Corregir conteo');
    expect(db.prepare('SELECT estado FROM jornadas_caja').get()).toEqual({ estado: 'ABIERTA' });
    expect(db.prepare('SELECT COUNT(*) AS total FROM cierres_jornada').get()).toEqual({ total: 1 });
    expect(db.prepare("SELECT accion FROM auditoria WHERE accion='REABRIR_JORNADA'").get()).toEqual(
      { accion: 'REABRIR_JORNADA' },
    );
  });

  it('rejects a changed reopening that reuses an idempotency key', async () => {
    await repository.closeNormal(command());
    const reopening = new SqliteJourneyReopeningRepository(new NodeCloseDatabase(db));
    const candidate = await reopening.findLatestCandidate();
    const request = {
      reopeningId: 'reopen-1',
      auditId: 'audit-reopen',
      closeId: candidate!.closeId,
      reason: 'Corregir conteo',
      actorUserId: 'cashier',
      idempotencyKey: 'reopen-key',
      reopenedAtUtc: '2026-07-29T22:10:00Z',
    };
    await reopening.reopen(request);

    await expect(
      reopening.reopen({ ...request, reopeningId: 'reopen-2', reason: 'Otro motivo' }),
    ).rejects.toBeInstanceOf(JourneyReopeningIdempotencyConflictError);
    expect(db.prepare('SELECT COUNT(*) AS total FROM reaperturas_jornada').get()).toEqual({
      total: 1,
    });
  });

  it('creates a corrected close linked to the original close and reopening', async () => {
    await repository.closeNormal(command());
    const reopening = new SqliteJourneyReopeningRepository(new NodeCloseDatabase(db));
    await reopening.reopen({
      reopeningId: 'reopen-1',
      auditId: 'audit-reopen',
      closeId: 'close-1',
      reason: 'Corregir conteo',
      actorUserId: 'cashier',
      idempotencyKey: 'reopen-key',
      reopenedAtUtc: '2026-07-29T22:10:00Z',
    });

    await expect(
      repository.closeNormal({ ...command(), closeId: 'close-2', idempotencyKey: 'normal-2' }),
    ).rejects.toBeInstanceOf(JourneyCloseBlockedError);
    const correctedCommand = {
      ...command(),
      closeId: 'close-2',
      auditId: 'audit-close-2',
      justification: 'Conteo rectificado por administración',
      actorUserId: 'admin',
      idempotencyKey: 'corrected-key',
      closedAtUtc: '2026-07-29T22:20:00Z',
    };
    const corrected = await repository.closeCorrected(correctedCommand);
    const repeated = await repository.closeCorrected(correctedCommand);

    expect(corrected.closeId).toBe('close-2');
    expect(repeated).toEqual(corrected);
    expect(await repository.findPendingCorrection()).toBeNull();
    expect(
      db
        .prepare(
          'SELECT id,cierre_anterior_id,reapertura_id,secuencia,tipo FROM cierres_jornada ORDER BY secuencia',
        )
        .all(),
    ).toEqual([
      {
        id: 'close-1',
        cierre_anterior_id: null,
        reapertura_id: null,
        secuencia: 1,
        tipo: 'NORMAL',
      },
      {
        id: 'close-2',
        cierre_anterior_id: 'close-1',
        reapertura_id: 'reopen-1',
        secuencia: 2,
        tipo: 'CORREGIDO',
      },
    ]);
    expect(db.prepare('SELECT estado FROM jornadas_caja').get()).toEqual({ estado: 'CERRADA' });
    expect(
      db.prepare("SELECT accion FROM auditoria WHERE accion='CERRAR_JORNADA_CORREGIDO'").get(),
    ).toEqual({ accion: 'CERRAR_JORNADA_CORREGIDO' });
  });
});

class NodeCloseDatabase implements JourneyCloseWriteDatabase {
  constructor(private readonly db: DatabaseSync) {}
  async query(
    sql: string,
    values: readonly JourneyCloseWriteValue[] = [],
  ): Promise<readonly JourneyCloseWriteRow[]> {
    return this.db
      .prepare(sql)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
  async run(sql: string, values: readonly JourneyCloseWriteValue[] = []): Promise<void> {
    this.db.prepare(sql).run(...([...values] as SQLInputValue[]));
  }
  async beginTransaction(): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE;');
  }
  async commitTransaction(): Promise<void> {
    this.db.exec('COMMIT;');
  }
  async rollbackTransaction(): Promise<void> {
    this.db.exec('ROLLBACK;');
  }
}
function command() {
  return {
    closeId: 'close-1',
    auditId: 'audit-close-1',
    actualCashCents: 10000,
    justification: null,
    idempotencyKey: 'close-request',
    actorUserId: 'cashier',
    closedAtUtc: '2026-07-29T22:00:00Z',
    currentBusinessDate: '2026-07-29',
  };
}
function insertUserAndJourney(db: DatabaseSync) {
  const role = (db.prepare("SELECT id FROM roles WHERE codigo='CAJERO'").get() as { id: string })
    .id;
  const adminRole = (
    db.prepare("SELECT id FROM roles WHERE codigo='ADMINISTRADOR'").get() as { id: string }
  ).id;
  db.prepare(
    `INSERT INTO usuarios (id,rol_id,nombre_usuario,nombre_usuario_normalizado,nombre_mostrar,contrasena_hash,contrasena_sal,contrasena_algoritmo,activo,creado_en_utc,actualizado_en_utc) VALUES ('cashier',?,'Caja','caja','Caja','h','s','x',1,'now','now')`,
  ).run(role);
  db.prepare(
    `INSERT INTO usuarios (id,rol_id,nombre_usuario,nombre_usuario_normalizado,nombre_mostrar,contrasena_hash,contrasena_sal,contrasena_algoritmo,activo,creado_en_utc,actualizado_en_utc) VALUES ('admin',?,'Admin','admin','Admin','h','s','x',1,'now','now')`,
  ).run(adminRole);
  db.exec(
    `INSERT INTO jornadas_caja (id,fecha_negocio,estado,monto_inicial_centimos,abierta_por_usuario_id,abierta_en_utc,clave_idempotencia,version) VALUES ('journey-1','2026-07-29','ABIERTA',10000,'cashier','now','open-key',1)`,
  );
}
function insertOpenAccount(db: DatabaseSync) {
  db.exec(`INSERT INTO mesas VALUES ('table-1','M1','Mesa 1',1,1,'now','now');
  INSERT INTO operaciones (id,codigo,tipo,estado,jornada_creacion_id,creada_por_usuario_id,creada_en_utc,subtotal_catalogo_centimos,descuento_total_centimos,total_centimos,pagado_centimos,saldo_centimos,clave_idempotencia,version) VALUES ('account-1','CTA-1','CUENTA_MESA','ABIERTA','journey-1','cashier','now',1000,0,1000,0,1000,'account-key',1);
  INSERT INTO operacion_mesas (id,operacion_id,mesa_id,rol_mesa,vinculada_por_usuario_id,vinculada_en_utc) VALUES ('link-1','account-1','table-1','PRINCIPAL','cashier','now');`);
}
