import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteQuickSaleRepository,
  type QuickSaleDatabase,
  type QuickSaleRow,
  type QuickSaleValue,
} from '../../src/app/core/sale/sqlite-quick-sale.repository';
import { SqliteQuickSaleFinalizationRepository } from '../../src/app/core/sale/sqlite-quick-sale-finalization.repository';
import { SqlitePendingQuickSalesRepository } from '../../src/app/core/sale/sqlite-pending-quick-sales.repository';
import { SqliteQuickSaleCancellationRepository } from '../../src/app/core/sale/sqlite-quick-sale-cancellation.repository';
import { SqliteQuickSaleHistoryRepository } from '../../src/app/core/sale/sqlite-quick-sale-history.repository';
import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import {
  OpenJourneyForQuickSaleRequiredError,
  QuickSaleAddonNotAllowedError,
  QuickSaleIdempotencyConflictError,
  type CreateQuickSaleCommand,
} from '../../src/app/domain/sale/create-quick-sale.use-case';
import {
  InvalidQuickSalePaymentError,
  type FinalizeQuickSaleCommand,
} from '../../src/app/domain/sale/finalize-quick-sale.use-case';

describe('SqliteQuickSaleRepository', () => {
  let db: DatabaseSync;
  let repository: SqliteQuickSaleRepository;
  let finalizationRepository: SqliteQuickSaleFinalizationRepository;
  let pendingRepository: SqlitePendingQuickSalesRepository;
  let cancellationRepository: SqliteQuickSaleCancellationRepository;
  let historyRepository: SqliteQuickSaleHistoryRepository;
  let mainProductId: string;
  let addonProductId: string;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    for (const migration of DATABASE_MIGRATIONS)
      for (const sql of migration.statements) db.exec(sql);
    insertUserAndJourney(db);
    mainProductId = productId(db, 'KANKACHO_20');
    addonProductId = productId(db, 'PAPA_ADICIONAL_2');
    const database = new NodeQuickSaleDatabase(db);
    repository = new SqliteQuickSaleRepository(database);
    finalizationRepository = new SqliteQuickSaleFinalizationRepository(database);
    pendingRepository = new SqlitePendingQuickSalesRepository(database);
    cancellationRepository = new SqliteQuickSaleCancellationRepository(database);
    historyRepository = new SqliteQuickSaleHistoryRepository(database);
  });

  afterEach(() => db.close());

  it('creates an open quick sale with frozen principal and addon prices', async () => {
    const created = await repository.create(command(mainProductId, addonProductId));
    expect(created).toEqual(
      expect.objectContaining({
        operationId: 'sale-1',
        operationCode: 'VR-20260729-0001',
        state: 'ABIERTA',
        totalCents: 4200,
        balanceCents: 4200,
        detailCount: 2,
      }),
    );
    db.prepare('UPDATE productos SET precio_centimos = 9999 WHERE id = ?').run(mainProductId);
    expect(
      db
        .prepare(
          `SELECT producto_id,detalle_principal_id,producto_nombre_snapshot,
                  precio_catalogo_unitario_centimos,precio_aplicado_unitario_centimos,
                  cantidad_total,subtotal_centimos
             FROM operacion_detalles ORDER BY detalle_principal_id NULLS FIRST`,
        )
        .all(),
    ).toEqual([
      {
        producto_id: mainProductId,
        detalle_principal_id: null,
        producto_nombre_snapshot: 'Kankacho S/20',
        precio_catalogo_unitario_centimos: 2000,
        precio_aplicado_unitario_centimos: 2000,
        cantidad_total: 2,
        subtotal_centimos: 4000,
      },
      {
        producto_id: addonProductId,
        detalle_principal_id: 'detail-main',
        producto_nombre_snapshot: 'Papa adicional S/2',
        precio_catalogo_unitario_centimos: 200,
        precio_aplicado_unitario_centimos: 200,
        cantidad_total: 1,
        subtotal_centimos: 200,
      },
    ]);
    expect(
      db.prepare("SELECT accion FROM auditoria WHERE accion='CREAR_VENTA_RAPIDA'").get(),
    ).toEqual({ accion: 'CREAR_VENTA_RAPIDA' });
  });

  it('is idempotent and rejects changed content under the same key', async () => {
    const request = command(mainProductId, addonProductId);
    const first = await repository.create(request);
    const repeated = await repository.create({
      ...request,
      operationId: 'another-id',
      operationCode: 'VR-OTHER',
      auditId: 'another-audit',
    });
    expect(repeated).toEqual(first);
    await expect(
      repository.create({
        ...request,
        operationId: 'changed-id',
        operationCode: 'VR-CHANGED',
        auditId: 'changed-audit',
        lines: [{ ...request.lines[0], quantity: 3 }],
      }),
    ).rejects.toBeInstanceOf(QuickSaleIdempotencyConflictError);
    expect(db.prepare('SELECT COUNT(*) AS total FROM operaciones').get()).toEqual({ total: 1 });
  });

  it('rolls back when an addon is attached to a product that does not allow addons', async () => {
    const beverageId = productId(db, 'INKA_600');
    await expect(repository.create(command(beverageId, addonProductId))).rejects.toBeInstanceOf(
      QuickSaleAddonNotAllowedError,
    );
    expect(db.prepare('SELECT COUNT(*) AS total FROM operaciones').get()).toEqual({ total: 0 });
  });

  it('requires an open journey', async () => {
    db.exec("UPDATE jornadas_caja SET estado='CERRADA'");
    await expect(repository.create(command(mainProductId, addonProductId))).rejects.toBeInstanceOf(
      OpenJourneyForQuickSaleRequiredError,
    );
  });

  it('freezes an authorized line discount and derives operation totals from its details', async () => {
    const request = command(mainProductId, addonProductId);
    await repository.create({
      ...request,
      lines: [
        {
          ...request.lines[0],
          priceAdjustment: {
            type: 'DESCUENTO',
            appliedPriceCents: 1800,
            reason: 'Promoción del día',
          },
        },
      ],
    });

    expect(
      db
        .prepare(
          'SELECT subtotal_catalogo_centimos,descuento_total_centimos,total_centimos FROM operaciones WHERE id=?',
        )
        .get('sale-1'),
    ).toEqual({
      subtotal_catalogo_centimos: 4200,
      descuento_total_centimos: 400,
      total_centimos: 3800,
    });
    expect(
      db
        .prepare(
          `SELECT precio_catalogo_unitario_centimos,precio_aplicado_unitario_centimos,
                  tipo_ajuste_precio,motivo_ajuste_precio,ajustado_por_usuario_id
             FROM operacion_detalles WHERE id='detail-main'`,
        )
        .get(),
    ).toEqual({
      precio_catalogo_unitario_centimos: 2000,
      precio_aplicado_unitario_centimos: 1800,
      tipo_ajuste_precio: 'DESCUENTO',
      motivo_ajuste_precio: 'Promoción del día',
      ajustado_por_usuario_id: 'cashier',
    });
    expect((await pendingRepository.list())[0].lines[0]).toEqual(
      expect.objectContaining({
        catalogPriceCents: 2000,
        priceCents: 1800,
        priceAdjustment: { type: 'DESCUENTO', reason: 'Promoción del día' },
      }),
    );
  });

  it('atomically collects cash, assigns every detail and finalizes the quick sale', async () => {
    await repository.create(command(mainProductId, addonProductId));

    const finalized = await finalizationRepository.finalize(finalizationCommand());

    expect(finalized).toEqual({
      operationId: 'sale-1',
      operationCode: 'VR-20260729-0001',
      paymentId: 'payment-1',
      totalCents: 4200,
      receivedCents: 5000,
      changeCents: 800,
      payments: [{ methodCode: 'EFECTIVO', appliedCents: 4200, receivedCents: 5000 }],
      finalizedAtUtc: '2026-07-29T20:05:00Z',
    });
    expect(
      db
        .prepare(
          'SELECT estado,pagado_centimos,saldo_centimos,jornada_venta_id FROM operaciones WHERE id=?',
        )
        .get('sale-1'),
    ).toEqual({
      estado: 'FINALIZADA',
      pagado_centimos: 4200,
      saldo_centimos: 0,
      jornada_venta_id: 'journey-1',
    });
    expect(db.prepare('SELECT COUNT(*) AS total FROM cobro_detalles').get()).toEqual({ total: 2 });
    expect(
      db.prepare('SELECT monto_centimos,tipo FROM movimientos_caja WHERE id=?').get('movement-1'),
    ).toEqual({ monto_centimos: 4200, tipo: 'INGRESO_COBRO' });
    expect(
      db
        .prepare("SELECT accion FROM auditoria WHERE accion='COBRAR_Y_FINALIZAR_VENTA_RAPIDA'")
        .get(),
    ).toEqual({ accion: 'COBRAR_Y_FINALIZAR_VENTA_RAPIDA' });
  });

  it('rolls back a Yape payment whose received amount differs from the exact total', async () => {
    await repository.create(command(mainProductId, addonProductId));

    await expect(
      finalizationRepository.finalize({
        ...finalizationCommand(),
        payments: [
          {
            paymentMethodEntryId: 'payment-method-1',
            movementId: 'movement-1',
            methodCode: 'YAPE',
            appliedCents: 4200,
            receivedCents: 5000,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidQuickSalePaymentError);

    expect(db.prepare('SELECT COUNT(*) AS total FROM cobros').get()).toEqual({ total: 0 });
    expect(db.prepare('SELECT estado FROM operaciones WHERE id=?').get('sale-1')).toEqual({
      estado: 'ABIERTA',
    });
  });

  it('records cash and Yape as separate movements in one combined payment', async () => {
    await repository.create(command(mainProductId, addonProductId));
    const request = finalizationCommand();
    const finalized = await finalizationRepository.finalize({
      ...request,
      payments: [
        {
          paymentMethodEntryId: 'cash-entry',
          movementId: 'cash-movement',
          methodCode: 'EFECTIVO',
          appliedCents: 2200,
          receivedCents: 2500,
        },
        {
          paymentMethodEntryId: 'yape-entry',
          movementId: 'yape-movement',
          methodCode: 'YAPE',
          appliedCents: 2000,
          receivedCents: 2000,
        },
      ],
    });
    expect(finalized.changeCents).toBe(300);
    expect(finalized.payments).toEqual([
      { methodCode: 'EFECTIVO', appliedCents: 2200, receivedCents: 2500 },
      { methodCode: 'YAPE', appliedCents: 2000, receivedCents: 2000 },
    ]);
    expect(
      db.prepare('SELECT monto_centimos FROM movimientos_caja ORDER BY monto_centimos').all(),
    ).toEqual([{ monto_centimos: 2000 }, { monto_centimos: 2200 }]);
  });

  it('recovers an unpaid quick sale with its frozen detail hierarchy until it is finalized', async () => {
    await repository.create(command(mainProductId, addonProductId));

    expect(await pendingRepository.list()).toEqual([
      {
        operationId: 'sale-1',
        operationCode: 'VR-20260729-0001',
        totalCents: 4200,
        createdAtUtc: '2026-07-29T20:00:00Z',
        lines: [
          {
            detailId: 'detail-main',
            productId: mainProductId,
            name: 'Kankacho S/20',
            quantity: 2,
            priceCents: 2000,
            catalogPriceCents: 2000,
            priceAdjustment: null,
            addons: [
              {
                detailId: 'detail-addon',
                productId: addonProductId,
                name: 'Papa adicional S/2',
                quantity: 1,
                priceCents: 200,
              },
            ],
          },
        ],
      },
    ]);

    await finalizationRepository.finalize(finalizationCommand());
    expect(await pendingRepository.list()).toEqual([]);
  });

  it('cancels an unpaid quick sale with a reason, audit and idempotent retry', async () => {
    await repository.create(command(mainProductId, addonProductId));
    const cancellation = {
      operationId: 'sale-1',
      reason: 'Cliente desistió',
      actorUserId: 'cashier',
      auditId: 'cancel-key-1',
      cancelledAtUtc: '2026-07-30T12:00:00Z',
    };

    const first = await cancellationRepository.cancel(cancellation);
    expect(await cancellationRepository.cancel(cancellation)).toEqual(first);
    expect(
      db
        .prepare(
          'SELECT estado,motivo_anulacion,anulada_por_usuario_id FROM operaciones WHERE id=?',
        )
        .get('sale-1'),
    ).toEqual({
      estado: 'ANULADA',
      motivo_anulacion: 'Cliente desistió',
      anulada_por_usuario_id: 'cashier',
    });
    expect(await pendingRepository.list()).toEqual([]);
    expect(
      db
        .prepare("SELECT COUNT(*) AS total FROM auditoria WHERE accion='ANULAR_VENTA_RAPIDA'")
        .get(),
    ).toEqual({ total: 1 });
  });

  it('lists finalized quick sales with frozen lines and payment methods in read-only history', async () => {
    await repository.create(command(mainProductId, addonProductId));
    await finalizationRepository.finalize(finalizationCommand());

    const history = await historyRepository.list();

    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(
      expect.objectContaining({
        operationId: 'sale-1',
        operationCode: 'VR-20260729-0001',
        state: 'FINALIZADA',
        totalCents: 4200,
        cancellationReason: null,
        paymentMethods: ['Efectivo'],
      }),
    );
    expect(history[0].lines).toHaveLength(1);
    expect(history[0].lines[0].addons).toHaveLength(1);
  });
});

function command(mainProductId: string, addonProductId: string): CreateQuickSaleCommand {
  return {
    operationId: 'sale-1',
    operationCode: 'VR-20260729-0001',
    auditId: 'audit-sale-1',
    lines: [
      {
        detailId: 'detail-main',
        productId: mainProductId,
        quantity: 2,
        priceAdjustment: null,
        addons: [{ detailId: 'detail-addon', productId: addonProductId, quantity: 1 }],
      },
    ],
    note: 'Para llevar',
    idempotencyKey: 'sale-request-1',
    actorUserId: 'cashier',
    createdAtUtc: '2026-07-29T20:00:00Z',
  };
}

function finalizationCommand(): FinalizeQuickSaleCommand {
  return {
    paymentId: 'payment-1',
    auditId: 'audit-payment-1',
    operationId: 'sale-1',
    payments: [
      {
        paymentMethodEntryId: 'payment-method-1',
        movementId: 'movement-1',
        methodCode: 'EFECTIVO',
        appliedCents: 4200,
        receivedCents: 5000,
      },
    ],
    actorUserId: 'cashier',
    idempotencyKey: 'payment-request-1',
    confirmedAtUtc: '2026-07-29T20:05:00Z',
  };
}

function productId(db: DatabaseSync, code: string): string {
  return (db.prepare('SELECT id FROM productos WHERE codigo = ?').get(code) as { id: string }).id;
}

function insertUserAndJourney(db: DatabaseSync): void {
  const roleId = (db.prepare("SELECT id FROM roles WHERE codigo='CAJERO'").get() as { id: string })
    .id;
  db.prepare(
    `INSERT INTO usuarios (id,rol_id,nombre_usuario,nombre_usuario_normalizado,nombre_mostrar,
      contrasena_hash,contrasena_sal,contrasena_algoritmo,activo,creado_en_utc,actualizado_en_utc)
     VALUES ('cashier',?,'Caja','caja','Caja','h','s','x',1,'now','now')`,
  ).run(roleId);
  db.exec(
    `INSERT INTO jornadas_caja (id,fecha_negocio,estado,monto_inicial_centimos,
      abierta_por_usuario_id,abierta_en_utc,clave_idempotencia,version)
     VALUES ('journey-1','2026-07-29','ABIERTA',10000,'cashier','now','open-key',1)`,
  );
}

class NodeQuickSaleDatabase implements QuickSaleDatabase {
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
  async run(sql: string, values: readonly QuickSaleValue[] = []): Promise<void> {
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
