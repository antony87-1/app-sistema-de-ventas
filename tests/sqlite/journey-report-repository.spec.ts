import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import { SqliteJourneyReportRepository } from '../../src/app/core/report/sqlite-journey-report.repository';
import type {
  QuickSaleDatabase,
  QuickSaleRow,
  QuickSaleValue,
} from '../../src/app/core/sale/sqlite-quick-sale.repository';

describe('SQLite journey report repository', () => {
  let database: DatabaseSync;
  let repository: SqliteJourneyReportRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys=ON;');
    for (const migration of DATABASE_MIGRATIONS)
      for (const statement of migration.statements) database.exec(statement);
    seed(database);
    repository = new SqliteJourneyReportRepository(new NodeDatabase(database));
  });

  afterEach(() => database.close());

  it('lists open and closed journeys from the newest business date', async () => {
    expect((await repository.listJourneys()).map((item) => item.id)).toEqual([
      'journey-2',
      'journey-1',
    ]);
  });

  it('reports cash by movement journey and sales by recognition journey only once', async () => {
    const report = await repository.get('journey-1');

    expect(report).not.toBeNull();
    expect(report?.expectedCashCents).toBe(12000);
    expect(report?.cashMethods.find((item) => item.code === 'EFECTIVO')).toEqual(
      expect.objectContaining({ inflowCents: 3000, outflowCents: 1000, netCents: 2000 }),
    );
    expect(report?.grossSalesCents).toBe(3000);
    expect(report?.salesCorrectionSubtractsCents).toBe(500);
    expect(report?.netSalesCents).toBe(2500);
    expect(report?.salesOperations.map((item) => item.code)).toEqual(['VR-1']);
  });

  it('does not count a scheduled sale delivered in another journey as cash in that journey', async () => {
    const report = await repository.get('journey-2');

    expect(report?.cashMethods.find((item) => item.code === 'EFECTIVO')?.inflowCents).toBe(0);
    expect(report?.salesOperations.map((item) => item.code)).toEqual(['PP-1']);
    expect(report?.grossSalesCents).toBe(8000);
  });
});

function seed(database: DatabaseSync): void {
  const role = (
    database.prepare("SELECT id FROM roles WHERE codigo='ADMINISTRADOR'").get() as { id: string }
  ).id;
  const cash = (
    database.prepare("SELECT id FROM metodos_pago WHERE codigo='EFECTIVO'").get() as { id: string }
  ).id;
  const expenseCategory = (
    database.prepare("SELECT id FROM categorias_gasto WHERE codigo='INSUMOS'").get() as {
      id: string;
    }
  ).id;
  database
    .prepare(
      `INSERT INTO usuarios
    (id,rol_id,nombre_usuario,nombre_usuario_normalizado,nombre_mostrar,contrasena_hash,contrasena_sal,contrasena_algoritmo,activo,creado_en_utc,actualizado_en_utc)
    VALUES ('admin',?,'Admin','admin','Admin','h','s','x',1,'now','now')`,
    )
    .run(role);
  database.exec(`INSERT INTO jornadas_caja
    (id,fecha_negocio,estado,monto_inicial_centimos,abierta_por_usuario_id,abierta_en_utc,clave_idempotencia,version) VALUES
    ('journey-1','2026-07-29','CERRADA',10000,'admin','2026-07-29T10:00:00Z','j1',1),
    ('journey-2','2026-07-30','ABIERTA',0,'admin','2026-07-30T10:00:00Z','j2',1);
    INSERT INTO operaciones
    (id,codigo,tipo,estado,jornada_creacion_id,jornada_venta_id,creada_por_usuario_id,creada_en_utc,finalizada_por_usuario_id,finalizada_en_utc,subtotal_catalogo_centimos,descuento_total_centimos,total_centimos,pagado_centimos,saldo_centimos,clave_idempotencia,version) VALUES
    ('op-1','VR-1','VENTA_RAPIDA','FINALIZADA','journey-1','journey-1','admin','a','admin','2026-07-29T12:00:00Z',3000,0,3000,3000,0,'op1',1),
    ('op-2','PP-1','PEDIDO_PROGRAMADO','FINALIZADA','journey-1','journey-2','admin','b','admin','2026-07-30T12:00:00Z',8000,0,8000,8000,0,'op2',1);`);
  database
    .prepare(
      `INSERT INTO cobros
    (id,operacion_id,jornada_id,confirmado_por_usuario_id,tipo,importe_centimos,saldo_resultante_centimos,confirmado_en_utc,clave_idempotencia)
    VALUES ('charge-1','op-1','journey-1','admin','PAGO_GENERAL_PEDIDO',3000,0,'2026-07-29T12:00:00Z','charge1')`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO cobro_metodos
    (id,cobro_id,metodo_pago_id,monto_aplicado_centimos,monto_recibido_centimos,vuelto_centimos)
    VALUES ('entry-1','charge-1',?,3000,3000,0)`,
    )
    .run(cash);
  database
    .prepare(
      `INSERT INTO movimientos_caja
    (id,jornada_id,metodo_pago_id,registrado_por_usuario_id,tipo,monto_centimos,cobro_metodo_id,ocurrido_en_utc)
    VALUES ('movement-in','journey-1',?,'admin','INGRESO_COBRO',3000,'entry-1','2026-07-29T12:00:00Z')`,
    )
    .run(cash);
  database
    .prepare(
      `INSERT INTO gastos
    (id,jornada_id,categoria_gasto_id,metodo_pago_id,registrado_por_usuario_id,descripcion,monto_centimos,registrado_en_utc,clave_idempotencia)
    VALUES ('expense-1','journey-1',?,?,'admin','Insumos',1000,'2026-07-29T13:00:00Z','expense1')`,
    )
    .run(expenseCategory, cash);
  database
    .prepare(
      `INSERT INTO movimientos_caja
    (id,jornada_id,metodo_pago_id,registrado_por_usuario_id,tipo,monto_centimos,gasto_id,ocurrido_en_utc)
    VALUES ('movement-out','journey-1',?,'admin','SALIDA_GASTO',1000,'expense-1','2026-07-29T13:00:00Z')`,
    )
    .run(cash);
  database.exec(`INSERT INTO correcciones_economicas
    (id,jornada_id,creada_por_usuario_id,operacion_original_id,motivo,impacto_caja,monto_caja_centimos,impacto_venta,monto_venta_centimos,jornada_venta_impactada_id,creada_en_utc,clave_idempotencia)
    VALUES ('correction-1','journey-2','admin','op-1','Ajuste de venta','SIN_EFECTO',0,'RESTA',500,'journey-1','2026-07-30T14:00:00Z','correction1');`);
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
