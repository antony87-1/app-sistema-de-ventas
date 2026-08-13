import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';
import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import { SqliteEconomicCorrectionsRepository } from '../../src/app/core/correction/sqlite-economic-corrections.repository';
import type {
  QuickSaleDatabase,
  QuickSaleRow,
  QuickSaleValue,
} from '../../src/app/core/sale/sqlite-quick-sale.repository';
import type { EconomicCorrectionCommand } from '../../src/app/domain/correction/manage-economic-corrections.use-case';

describe('SQLite economic corrections repository', () => {
  let db: DatabaseSync;
  let repository: SqliteEconomicCorrectionsRepository;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON;');
    for (const migration of DATABASE_MIGRATIONS)
      for (const sql of migration.statements) db.exec(sql);
    seed(db);
    repository = new SqliteEconomicCorrectionsRepository(new NodeDatabase(db));
  });
  afterEach(() => db.close());

  it('preserves the original and creates cash, sale and audit compensation atomically', async () => {
    const result = await repository.create(command());
    expect(result).toEqual(
      expect.objectContaining({
        originalId: 'operation-1',
        cashImpact: 'RESTA',
        saleImpact: 'RESTA',
      }),
    );
    expect(
      db.prepare("SELECT total_centimos,estado FROM operaciones WHERE id='operation-1'").get(),
    ).toEqual({ total_centimos: 5000, estado: 'FINALIZADA' });
    expect(
      db
        .prepare(
          "SELECT jornada_id,tipo,monto_centimos FROM movimientos_caja WHERE correccion_id='correction-1'",
        )
        .get(),
    ).toEqual({ jornada_id: 'journey-2', tipo: 'CORRECCION_SALIDA', monto_centimos: 1000 });
    expect(
      db.prepare("SELECT accion,motivo FROM auditoria WHERE entidad_id='correction-1'").get(),
    ).toEqual({ accion: 'CREAR_CORRECCION_ECONOMICA', motivo: 'Cobro duplicado' });
  });
  it('creates a documentary or sales-only correction without a cash movement', async () => {
    await repository.create({
      ...command(),
      correctionId: 'correction-2',
      auditId: 'audit-2',
      idempotencyKey: 'request-2',
      cashImpact: 'SIN_EFECTO',
      cashAmountCents: 0,
      paymentMethodId: null,
    });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS total FROM movimientos_caja WHERE correccion_id='correction-2'",
        )
        .get(),
    ).toEqual({ total: 0 });
  });
  it('makes a repeated confirmation idempotent', async () => {
    const request = command();
    expect(await repository.create(request)).toEqual(
      await repository.create({
        ...request,
        correctionId: 'ignored',
        auditId: 'ignored',
        movementId: 'ignored',
      }),
    );
    expect(db.prepare('SELECT COUNT(*) AS total FROM correcciones_economicas').get()).toEqual({
      total: 1,
    });
  });
  it('lists originals and the immutable correction history', async () => {
    await repository.create(command());
    expect((await repository.listCorrectable()).some((item) => item.id === 'operation-1')).toBe(
      true,
    );
    expect(await repository.listCorrections()).toEqual([
      expect.objectContaining({ reason: 'Cobro duplicado', createdBy: 'Administrador' }),
    ]);
  });
});

function command(): EconomicCorrectionCommand {
  return {
    correctionId: 'correction-1',
    movementId: 'movement-correction-1',
    auditId: 'audit-correction-1',
    originalId: 'operation-1',
    originalType: 'OPERACION',
    reason: 'Cobro duplicado',
    cashImpact: 'RESTA',
    cashAmountCents: 1000,
    paymentMethodId: cashId(),
    saleImpact: 'RESTA',
    saleAmountCents: 1000,
    saleJourneyId: 'journey-1',
    idempotencyKey: 'request-1',
    actorUserId: 'admin',
    occurredAtUtc: '2026-07-30T20:00:00Z',
  };
}
function cashId() {
  return '00000000-0000-7000-8000-000000000010';
}
function seed(db: DatabaseSync) {
  const role = (
    db.prepare("SELECT id FROM roles WHERE codigo='ADMINISTRADOR'").get() as { id: string }
  ).id;
  db.prepare(
    `INSERT INTO usuarios (id,rol_id,nombre_usuario,nombre_usuario_normalizado,nombre_mostrar,contrasena_hash,contrasena_sal,contrasena_algoritmo,activo,creado_en_utc,actualizado_en_utc) VALUES ('admin',?,'Admin','admin','Administrador','h','s','x',1,'now','now')`,
  ).run(role);
  db.exec(
    `INSERT INTO jornadas_caja (id,fecha_negocio,estado,monto_inicial_centimos,abierta_por_usuario_id,abierta_en_utc,clave_idempotencia,version) VALUES ('journey-1','2026-07-29','CERRADA',0,'admin','a','j1',1),('journey-2','2026-07-30','ABIERTA',0,'admin','b','j2',1);INSERT INTO operaciones (id,codigo,tipo,estado,jornada_creacion_id,jornada_venta_id,creada_por_usuario_id,creada_en_utc,finalizada_por_usuario_id,finalizada_en_utc,subtotal_catalogo_centimos,descuento_total_centimos,total_centimos,pagado_centimos,saldo_centimos,clave_idempotencia,version) VALUES ('operation-1','VR-1','VENTA_RAPIDA','FINALIZADA','journey-1','journey-1','admin','a','admin','b',5000,0,5000,5000,0,'op1',1);`,
  );
}
class NodeDatabase implements QuickSaleDatabase {
  constructor(private readonly db: DatabaseSync) {}
  async query(
    sql: string,
    values: readonly QuickSaleValue[] = [],
  ): Promise<readonly QuickSaleRow[]> {
    return this.db
      .prepare(sql)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
  async run(sql: string, values: readonly QuickSaleValue[] = []) {
    this.db.prepare(sql).run(...([...values] as SQLInputValue[]));
  }
  async beginTransaction() {
    this.db.exec('BEGIN IMMEDIATE');
  }
  async commitTransaction() {
    this.db.exec('COMMIT');
  }
  async rollbackTransaction() {
    this.db.exec('ROLLBACK');
  }
}
