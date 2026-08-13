import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import {
  MIGRATION_V1,
  MIGRATION_V1_CHECKSUM,
  MIGRATION_V1_SCHEMA_STATEMENTS,
} from '../../src/app/core/database/migrations/migration-v1';

const NOW = '2026-07-29T05:00:00.000Z';

describe('migration v1', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');

    for (const statement of MIGRATION_V1.statements) {
      database.exec(statement);
    }
  });

  afterEach(() => database.close());

  it('creates the 25 approved tables and leaves foreign keys consistent', () => {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => String(row['name']));

    expect(tables).toEqual([
      'auditoria',
      'categorias',
      'categorias_gasto',
      'cierres_jornada',
      'clientes',
      'cobro_detalles',
      'cobro_metodos',
      'cobros',
      'configuracion',
      'copias_seguridad',
      'correcciones_economicas',
      'gastos',
      'jornadas_caja',
      'mesas',
      'metodos_pago',
      'movimientos_caja',
      'operacion_detalles',
      'operacion_mesas',
      'operaciones',
      'pedido_programado_datos',
      'productos',
      'reaperturas_jornada',
      'roles',
      'schema_version',
      'usuarios',
    ]);
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('records the migration checksum and seeds only fixed catalogs', () => {
    const calculatedChecksum = createHash('sha256')
      .update(MIGRATION_V1_SCHEMA_STATEMENTS.join('\n'))
      .digest('hex');
    const schemaVersion = database
      .prepare('SELECT version, nombre, checksum FROM schema_version')
      .get();

    expect(calculatedChecksum).toBe(MIGRATION_V1_CHECKSUM);
    expect(schemaVersion).toEqual({
      version: 1,
      nombre: 'initial_schema',
      checksum: MIGRATION_V1_CHECKSUM,
    });
    expect(database.prepare('SELECT codigo FROM roles ORDER BY codigo').all()).toEqual([
      { codigo: 'ADMINISTRADOR' },
      { codigo: 'CAJERO' },
    ]);
    expect(database.prepare('SELECT codigo FROM metodos_pago ORDER BY orden').all()).toEqual([
      { codigo: 'EFECTIVO' },
      { codigo: 'YAPE' },
    ]);
    expect(database.prepare('SELECT COUNT(*) AS total FROM productos').get()).toEqual({
      total: 0,
    });
  });

  it('is safe when version 1 statements are evaluated again', () => {
    expect(() => {
      for (const statement of MIGRATION_V1.statements) database.exec(statement);
    }).not.toThrow();

    expect(database.prepare('SELECT COUNT(*) AS total FROM roles').get()).toEqual({ total: 2 });
    expect(database.prepare('SELECT COUNT(*) AS total FROM schema_version').get()).toEqual({
      total: 1,
    });
  });

  it('allows only one open cash journey', () => {
    insertUser(database, 'user-admin');
    insertJourney(database, 'journey-1', '2026-07-29', 'user-admin');

    expect(() => insertJourney(database, 'journey-2', '2026-07-30', 'user-admin')).toThrow();
  });

  it('protects operation balances and finalization data', () => {
    insertUser(database, 'user-admin');
    insertJourney(database, 'journey-1', '2026-07-29', 'user-admin');

    expect(() =>
      insertOperation(database, {
        id: 'operation-invalid-balance',
        journeyId: 'journey-1',
        userId: 'user-admin',
        total: 100,
        paid: 40,
        balance: 61,
      }),
    ).toThrow();
    expect(() =>
      insertOperation(database, {
        id: 'operation-invalid-final',
        journeyId: 'journey-1',
        userId: 'user-admin',
        state: 'FINALIZADA',
      }),
    ).toThrow();
  });

  it('prevents a table from being active in two accounts and two active principals', () => {
    const fixture = insertOperationFixture(database);
    insertTable(database, 'table-1', 'MESA_01');
    insertTable(database, 'table-2', 'MESA_02');
    insertOperationTable(database, 'link-1', fixture.firstOperationId, 'table-1', 'PRINCIPAL');

    expect(() =>
      insertOperationTable(database, 'link-2', fixture.secondOperationId, 'table-1', 'PRINCIPAL'),
    ).toThrow();
    expect(() =>
      insertOperationTable(database, 'link-3', fixture.firstOperationId, 'table-2', 'PRINCIPAL'),
    ).toThrow();
  });

  it('enforces detail quantities, assigned discounts and same-operation additions', () => {
    const fixture = insertOperationFixture(database);
    insertCatalog(database);

    expect(() =>
      insertDetail(database, {
        id: 'invalid-quantity',
        operationId: fixture.firstOperationId,
        served: 2,
        quantity: 1,
      }),
    ).toThrow();
    expect(() =>
      insertDetail(database, {
        id: 'invalid-discount',
        operationId: fixture.firstOperationId,
        catalogPrice: 2000,
        appliedPrice: 1800,
        priceAdjustment: 'DESCUENTO',
      }),
    ).toThrow();

    insertDetail(database, { id: 'principal', operationId: fixture.firstOperationId });
    expect(() =>
      insertDetail(database, {
        id: 'cross-operation-addon',
        operationId: fixture.secondOperationId,
        principalId: 'principal',
      }),
    ).toThrow();

    insertDetail(database, {
      id: 'addon',
      operationId: fixture.firstOperationId,
      principalId: 'principal',
    });
    database.prepare('DELETE FROM operacion_detalles WHERE id = ?').run('principal');
    expect(database.prepare('SELECT COUNT(*) AS total FROM operacion_detalles').get()).toEqual({
      total: 0,
    });
  });

  it('requires coherent scheduled payment states', () => {
    const fixture = insertOperationFixture(database, 'PEDIDO_PROGRAMADO');

    expect(() =>
      insertScheduledOrder(database, fixture.firstOperationId, 'PAGO_BLOQUEADO_REVISION', null),
    ).toThrow();
    expect(() =>
      insertScheduledOrder(database, fixture.firstOperationId, 'SIN_ADELANTO', 'unexpected'),
    ).toThrow();
    insertScheduledOrder(
      database,
      fixture.firstOperationId,
      'PAGO_BLOQUEADO_REVISION',
      'Revisión administrativa',
    );
  });

  it('validates closure differences and exceptional justification', () => {
    insertUser(database, 'user-admin');
    insertJourney(database, 'journey-1', '2026-07-29', 'user-admin');

    expect(() =>
      insertClosure(database, {
        id: 'closure-invalid-difference',
        differenceType: 'SOBRANTE',
        difference: 0,
      }),
    ).toThrow();
    expect(() =>
      insertClosure(database, {
        id: 'closure-without-reason',
        differenceType: 'FALTANTE',
        difference: 100,
      }),
    ).toThrow();
    expect(() =>
      insertClosure(database, { id: 'exceptional-without-reason', type: 'EXCEPCIONAL' }),
    ).toThrow();
    insertClosure(database, { id: 'closure-valid' });
  });

  it('requires one correction target and coherent independent impacts', () => {
    const fixture = insertOperationFixture(database);

    expect(() => insertCorrection(database, { id: 'without-target', operationId: null })).toThrow();
    expect(() =>
      insertCorrection(database, {
        id: 'two-targets',
        operationId: fixture.firstOperationId,
        correctionId: 'other-correction',
      }),
    ).toThrow();
    expect(() =>
      insertCorrection(database, {
        id: 'invalid-cash-impact',
        operationId: fixture.firstOperationId,
        cashImpact: 'SUMA',
        cashAmount: 0,
      }),
    ).toThrow();
    expect(() =>
      insertCorrection(database, {
        id: 'invalid-sale-impact',
        operationId: fixture.firstOperationId,
        saleImpact: 'RESTA',
        saleAmount: 100,
        impactedSaleJourneyId: null,
      }),
    ).toThrow();

    insertCorrection(database, {
      id: 'valid-correction',
      operationId: fixture.firstOperationId,
      cashImpact: 'SUMA',
      cashAmount: 100,
      saleImpact: 'RESTA',
      saleAmount: 100,
      impactedSaleJourneyId: fixture.journeyId,
    });
  });

  it('allows correction movements by method but rejects ambiguous origins', () => {
    const fixture = insertOperationFixture(database);
    insertCorrection(database, {
      id: 'correction-1',
      operationId: fixture.firstOperationId,
      cashImpact: 'SUMA',
      cashAmount: 150,
    });
    const cashMethodId = getPaymentMethodId(database, 'EFECTIVO');
    const yapeMethodId = getPaymentMethodId(database, 'YAPE');

    insertCorrectionMovement(database, 'movement-1', cashMethodId, 100);
    insertCorrectionMovement(database, 'movement-2', yapeMethodId, 50);

    expect(() =>
      database
        .prepare(
          `INSERT INTO movimientos_caja (
            id, jornada_id, metodo_pago_id, registrado_por_usuario_id, tipo,
            monto_centimos, gasto_id, correccion_id, ocurrido_en_utc
          ) VALUES (?, ?, ?, ?, 'CORRECCION_ENTRADA', 10, ?, ?, ?)`,
        )
        .run(
          'ambiguous-movement',
          fixture.journeyId,
          cashMethodId,
          fixture.userId,
          'some-expense',
          'correction-1',
          NOW,
        ),
    ).toThrow();
  });

  function insertCorrectionMovement(
    db: DatabaseSync,
    id: string,
    paymentMethodId: string,
    amount: number,
  ): void {
    db.prepare(
      `INSERT INTO movimientos_caja (
        id, jornada_id, metodo_pago_id, registrado_por_usuario_id, tipo,
        monto_centimos, correccion_id, ocurrido_en_utc
      ) VALUES (?, 'journey-1', ?, 'user-admin', 'CORRECCION_ENTRADA', ?, 'correction-1', ?)`,
    ).run(id, paymentMethodId, amount, NOW);
  }
});

function insertUser(database: DatabaseSync, id: string): void {
  const role = database.prepare("SELECT id FROM roles WHERE codigo = 'ADMINISTRADOR'").get() as {
    id: string;
  };
  database
    .prepare(
      `INSERT INTO usuarios (
        id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
        contrasena_hash, contrasena_sal, contrasena_algoritmo, activo,
        creado_en_utc, actualizado_en_utc
      ) VALUES (?, ?, 'admin', 'ADMIN', 'Administrador', 'hash', 'salt', 'argon2id', 1, ?, ?)`,
    )
    .run(id, role.id, NOW, NOW);
}

function insertJourney(
  database: DatabaseSync,
  id: string,
  businessDate: string,
  userId: string,
): void {
  database
    .prepare(
      `INSERT INTO jornadas_caja (
        id, fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
        abierta_en_utc, clave_idempotencia, version
      ) VALUES (?, ?, 'ABIERTA', 0, ?, ?, ?, 1)`,
    )
    .run(id, businessDate, userId, NOW, `idempotency-${id}`);
}

interface OperationValues {
  readonly id: string;
  readonly journeyId: string;
  readonly userId: string;
  readonly type?: 'VENTA_RAPIDA' | 'CUENTA_MESA' | 'PEDIDO_PROGRAMADO';
  readonly state?: 'ABIERTA' | 'FINALIZADA';
  readonly total?: number;
  readonly paid?: number;
  readonly balance?: number;
}

function insertOperation(database: DatabaseSync, values: OperationValues): void {
  database
    .prepare(
      `INSERT INTO operaciones (
        id, codigo, tipo, estado, jornada_creacion_id, creada_por_usuario_id,
        creada_en_utc, subtotal_catalogo_centimos, descuento_total_centimos,
        total_centimos, pagado_centimos, saldo_centimos, clave_idempotencia, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1)`,
    )
    .run(
      values.id,
      `CODE-${values.id}`,
      values.type ?? 'CUENTA_MESA',
      values.state ?? 'ABIERTA',
      values.journeyId,
      values.userId,
      NOW,
      values.total ?? 0,
      values.total ?? 0,
      values.paid ?? 0,
      values.balance ?? 0,
      `idempotency-${values.id}`,
    );
}

function insertOperationFixture(
  database: DatabaseSync,
  type: OperationValues['type'] = 'CUENTA_MESA',
): {
  readonly userId: string;
  readonly journeyId: string;
  readonly firstOperationId: string;
  readonly secondOperationId: string;
} {
  insertUser(database, 'user-admin');
  insertJourney(database, 'journey-1', '2026-07-29', 'user-admin');
  insertOperation(database, {
    id: 'operation-1',
    journeyId: 'journey-1',
    userId: 'user-admin',
    type,
  });
  insertOperation(database, {
    id: 'operation-2',
    journeyId: 'journey-1',
    userId: 'user-admin',
    type,
  });
  return {
    userId: 'user-admin',
    journeyId: 'journey-1',
    firstOperationId: 'operation-1',
    secondOperationId: 'operation-2',
  };
}

function insertTable(database: DatabaseSync, id: string, code: string): void {
  database
    .prepare(
      `INSERT INTO mesas (id, codigo, nombre, orden, activo, creado_en_utc, actualizado_en_utc)
       VALUES (?, ?, ?, 0, 1, ?, ?)`,
    )
    .run(id, code, code, NOW, NOW);
}

function insertOperationTable(
  database: DatabaseSync,
  id: string,
  operationId: string,
  tableId: string,
  role: 'PRINCIPAL' | 'VINCULADA',
): void {
  database
    .prepare(
      `INSERT INTO operacion_mesas (
        id, operacion_id, mesa_id, rol_mesa, vinculada_por_usuario_id, vinculada_en_utc
      ) VALUES (?, ?, ?, ?, 'user-admin', ?)`,
    )
    .run(id, operationId, tableId, role, NOW);
}

function insertCatalog(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO categorias (
        id, codigo, nombre, nombre_normalizado, orden, activo, creado_en_utc, actualizado_en_utc
      ) VALUES ('category-1', 'FOOD', 'Comida', 'COMIDA', 0, 1, ?, ?)`,
    )
    .run(NOW, NOW);
  database
    .prepare(
      `INSERT INTO productos (
        id, categoria_id, codigo, nombre, nombre_normalizado, precio_centimos,
        es_adicional, disponibilidad, activo, creado_en_utc, actualizado_en_utc
      ) VALUES ('product-1', 'category-1', 'PRODUCT', 'Producto', 'PRODUCTO', 2000,
        0, 'DISPONIBLE', 1, ?, ?)`,
    )
    .run(NOW, NOW);
}

interface DetailValues {
  readonly id: string;
  readonly operationId: string;
  readonly principalId?: string;
  readonly quantity?: number;
  readonly served?: number;
  readonly paid?: number;
  readonly catalogPrice?: number;
  readonly appliedPrice?: number;
  readonly priceAdjustment?: 'NINGUNO' | 'DESCUENTO' | 'PRECIO_PERSONALIZADO';
  readonly adjustmentReason?: string;
}

function insertDetail(database: DatabaseSync, values: DetailValues): void {
  const quantity = values.quantity ?? 1;
  const appliedPrice = values.appliedPrice ?? 2000;
  database
    .prepare(
      `INSERT INTO operacion_detalles (
        id, operacion_id, producto_id, detalle_principal_id,
        producto_nombre_snapshot, categoria_nombre_snapshot,
        cantidad_total, cantidad_servida, cantidad_pagada,
        precio_catalogo_unitario_centimos, precio_aplicado_unitario_centimos,
        tipo_ajuste_precio, motivo_ajuste_precio, ajustado_por_usuario_id,
        subtotal_centimos, estado_servicio, agregado_por_usuario_id, agregado_en_utc
      ) VALUES (?, ?, 'product-1', ?, 'Producto', 'Comida', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', 'user-admin', ?)`,
    )
    .run(
      values.id,
      values.operationId,
      values.principalId ?? null,
      quantity,
      values.served ?? 0,
      values.paid ?? 0,
      values.catalogPrice ?? 2000,
      appliedPrice,
      values.priceAdjustment ?? 'NINGUNO',
      values.adjustmentReason ?? null,
      values.priceAdjustment && values.priceAdjustment !== 'NINGUNO' ? 'user-admin' : null,
      quantity * appliedPrice,
      NOW,
    );
}

function insertScheduledOrder(
  database: DatabaseSync,
  operationId: string,
  paymentState: string,
  blockReason: string | null,
): void {
  database
    .prepare(
      `INSERT INTO pedido_programado_datos (
        operacion_id, cliente_nombre_snapshot, cliente_telefono_snapshot,
        entrega_programada_local, zona_horaria, tipo_entrega,
        estado_preparacion, estado_pago, motivo_bloqueo_pago
      ) VALUES (?, 'Cliente', '999999999', '2026-07-30T12:00:00', 'America/Lima',
        'RECOJO', 'REGISTRADO', ?, ?)`,
    )
    .run(operationId, paymentState, blockReason);
}

interface ClosureValues {
  readonly id: string;
  readonly type?: 'NORMAL' | 'EXCEPCIONAL';
  readonly differenceType?: 'CUADRA' | 'SOBRANTE' | 'FALTANTE';
  readonly difference?: number;
  readonly justification?: string;
}

function insertClosure(database: DatabaseSync, values: ClosureValues): void {
  database
    .prepare(
      `INSERT INTO cierres_jornada (
        id, jornada_id, secuencia, tipo, realizado_por_usuario_id, cerrado_en_utc,
        efectivo_esperado_centimos, efectivo_real_centimos, tipo_diferencia,
        diferencia_centimos, justificacion, clave_idempotencia
      ) VALUES (?, 'journey-1', 1, ?, 'user-admin', ?, 0, 0, ?, ?, ?, ?)`,
    )
    .run(
      values.id,
      values.type ?? 'NORMAL',
      NOW,
      values.differenceType ?? 'CUADRA',
      values.difference ?? 0,
      values.justification ?? null,
      `idempotency-${values.id}`,
    );
}

interface CorrectionValues {
  readonly id: string;
  readonly operationId?: string | null;
  readonly correctionId?: string;
  readonly cashImpact?: 'SUMA' | 'RESTA' | 'SIN_EFECTO';
  readonly cashAmount?: number;
  readonly saleImpact?: 'SUMA' | 'RESTA' | 'SIN_EFECTO';
  readonly saleAmount?: number;
  readonly impactedSaleJourneyId?: string | null;
}

function insertCorrection(database: DatabaseSync, values: CorrectionValues): void {
  database
    .prepare(
      `INSERT INTO correcciones_economicas (
        id, jornada_id, creada_por_usuario_id, operacion_original_id,
        correccion_original_id, motivo, impacto_caja, monto_caja_centimos,
        impacto_venta, monto_venta_centimos, jornada_venta_impactada_id,
        creada_en_utc, clave_idempotencia
      ) VALUES (?, 'journey-1', 'user-admin', ?, ?, 'Corrección de prueba', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.id,
      values.operationId === undefined ? 'operation-1' : values.operationId,
      values.correctionId ?? null,
      values.cashImpact ?? 'SIN_EFECTO',
      values.cashAmount ?? 0,
      values.saleImpact ?? 'SIN_EFECTO',
      values.saleAmount ?? 0,
      values.impactedSaleJourneyId ?? null,
      NOW,
      `idempotency-${values.id}`,
    );
}

function getPaymentMethodId(database: DatabaseSync, code: string): string {
  const row = database.prepare('SELECT id FROM metodos_pago WHERE codigo = ?').get(code) as {
    id: string;
  };
  return row.id;
}
