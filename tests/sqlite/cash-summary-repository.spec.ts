import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteCashSummaryRepository,
  type CashSummaryQueryDatabase,
  type CashSummaryQueryRow,
  type CashSummaryQueryValue,
} from '../../src/app/core/cash/sqlite-cash-summary.repository';
import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';

describe('SqliteCashSummaryRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteCashSummaryRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    for (const migration of DATABASE_MIGRATIONS) {
      for (const statement of migration.statements) database.exec(statement);
    }
    insertCashierAndJourney(database);
    repository = new SqliteCashSummaryRepository(new NodeCashSummaryDatabase(database));
  });

  afterEach(() => database.close());

  it('calculates expected cash from initial cash and signed cash movements', async () => {
    insertExpenseAndCorrections(database);
    insertMovement(database, 'cash-in', 'EFECTIVO', 'CORRECCION_ENTRADA', 8000, 'correction-1');
    insertMovement(database, 'cash-out', 'EFECTIVO', 'SALIDA_GASTO', 2500, 'gasto-1');
    insertMovement(
      database,
      'cash-correction',
      'EFECTIVO',
      'CORRECCION_SALIDA',
      500,
      'correction-1',
    );
    insertMovement(database, 'yape-in', 'YAPE', 'CORRECCION_ENTRADA', 4000, 'correction-3');

    const summary = await repository.findOpen();

    expect(summary?.initialCashCents).toBe(10000);
    expect(summary?.expectedCashCents).toBe(15000);
    expect(summary?.methods).toEqual([
      {
        id: expect.any(String),
        code: 'EFECTIVO',
        name: 'Efectivo',
        inflowCents: 8000,
        outflowCents: 3000,
        netCents: 5000,
      },
      {
        id: expect.any(String),
        code: 'YAPE',
        name: 'Yape',
        inflowCents: 4000,
        outflowCents: 0,
        netCents: 4000,
      },
    ]);
  });

  it('returns null when there is no open journey', async () => {
    database.prepare("UPDATE jornadas_caja SET estado = 'CERRADA'").run();
    await expect(repository.findOpen()).resolves.toBeNull();
  });
});

class NodeCashSummaryDatabase implements CashSummaryQueryDatabase {
  constructor(private readonly database: DatabaseSync) {}

  async query(
    statement: string,
    values: readonly CashSummaryQueryValue[] = [],
  ): Promise<readonly CashSummaryQueryRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
}

function insertCashierAndJourney(database: DatabaseSync): void {
  const roleId = findId(database, 'roles', 'CAJERO');
  database
    .prepare(
      `INSERT INTO usuarios (
        id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
        contrasena_hash, contrasena_sal, contrasena_algoritmo, activo,
        creado_en_utc, actualizado_en_utc
      ) VALUES ('user-cashier', ?, 'Caja', 'caja', 'Caja', 'hash', 'salt', 'fixture', 1,
                '2026-07-29T14:00:00.000Z', '2026-07-29T14:00:00.000Z');`,
    )
    .run(roleId);
  database.exec(
    `INSERT INTO jornadas_caja (
      id, fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
      abierta_en_utc, clave_idempotencia, version
    ) VALUES ('journey-1', '2026-07-29', 'ABIERTA', 10000, 'user-cashier',
              '2026-07-29T14:00:00.000Z', 'journey-request', 1);`,
  );
}

function insertMovement(
  database: DatabaseSync,
  id: string,
  methodCode: string,
  type: 'INGRESO_COBRO' | 'SALIDA_GASTO' | 'CORRECCION_ENTRADA' | 'CORRECCION_SALIDA',
  amountCents: number,
  originId: string,
): void {
  const paymentMethodId = findId(database, 'metodos_pago', methodCode);
  const cobroId = type === 'INGRESO_COBRO' ? originId : null;
  const gastoId = type === 'SALIDA_GASTO' ? originId : null;
  const correctionId = type.startsWith('CORRECCION_') ? originId : null;
  database
    .prepare(
      `INSERT INTO movimientos_caja (
        id, jornada_id, metodo_pago_id, registrado_por_usuario_id, tipo,
        monto_centimos, cobro_metodo_id, gasto_id, correccion_id, ocurrido_en_utc
      ) VALUES (?, 'journey-1', ?, 'user-cashier', ?, ?, ?, ?, ?, '2026-07-29T15:00:00.000Z');`,
    )
    .run(id, paymentMethodId, type, amountCents, cobroId, gastoId, correctionId);
}

function insertExpenseAndCorrections(database: DatabaseSync): void {
  const categoryId = findId(database, 'categorias_gasto', 'INSUMOS');
  const cashMethodId = findId(database, 'metodos_pago', 'EFECTIVO');
  database
    .prepare(
      `INSERT INTO gastos (
        id, jornada_id, categoria_gasto_id, metodo_pago_id, registrado_por_usuario_id,
        descripcion, monto_centimos, registrado_en_utc, clave_idempotencia
      ) VALUES ('gasto-1', 'journey-1', ?, ?, 'user-cashier', 'Compra', 2500,
                '2026-07-29T15:00:00.000Z', 'expense-request');`,
    )
    .run(categoryId, cashMethodId);

  for (const correction of [
    { id: 'correction-1', impact: 'SUMA', amount: 8000 },
    { id: 'correction-2', impact: 'RESTA', amount: 500 },
    { id: 'correction-3', impact: 'SUMA', amount: 4000 },
  ]) {
    database
      .prepare(
        `INSERT INTO correcciones_economicas (
          id, jornada_id, creada_por_usuario_id, gasto_original_id, motivo,
          impacto_caja, monto_caja_centimos, impacto_venta, monto_venta_centimos,
          creada_en_utc, clave_idempotencia
        ) VALUES (?, 'journey-1', 'user-cashier', 'gasto-1', 'Ajuste de prueba', ?, ?,
                  'SIN_EFECTO', 0, '2026-07-29T15:00:00.000Z', ?);`,
      )
      .run(correction.id, correction.impact, correction.amount, `request-${correction.id}`);
  }
}

function findId(database: DatabaseSync, table: string, code: string): string {
  return String(
    (database.prepare(`SELECT id FROM ${table} WHERE codigo = ?`).get(code) as { id: string }).id,
  );
}
