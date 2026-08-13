import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import { SqliteScheduledOrdersRepository } from '../../src/app/core/scheduled-order/sqlite-scheduled-orders.repository';
import type {
  QuickSaleDatabase,
  QuickSaleRow,
  QuickSaleValue,
} from '../../src/app/core/sale/sqlite-quick-sale.repository';
import type {
  ScheduledAdvanceCommand,
  ScheduledOrderCommand,
  ScheduledTransitionCommand,
} from '../../src/app/domain/scheduled-order/manage-scheduled-orders.use-case';

describe('SQLite scheduled orders repository', () => {
  let database: DatabaseSync;
  let repository: SqliteScheduledOrdersRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of DATABASE_MIGRATIONS)
      for (const statement of migration.statements) database.exec(statement);
    seed(database);
    repository = new SqliteScheduledOrdersRepository(new NodeDatabase(database));
  });

  afterEach(() => database.close());

  it('registers products and addons as frozen parent-child details', async () => {
    const result = await repository.create(createCommand(database));

    expect(result).toEqual(
      expect.objectContaining({
        preparationState: 'REGISTRADO',
        paymentState: 'SIN_ADELANTO',
        totalCents: 2200,
        balanceCents: 2200,
      }),
    );
    expect(
      database
        .prepare(
          'SELECT id,detalle_principal_id,subtotal_centimos FROM operacion_detalles ORDER BY id',
        )
        .all(),
    ).toEqual([
      { id: 'detail-addon', detalle_principal_id: 'detail-main', subtotal_centimos: 200 },
      { id: 'detail-main', detalle_principal_id: null, subtotal_centimos: 2000 },
    ]);
    expect(
      database
        .prepare("SELECT COUNT(*) AS total FROM auditoria WHERE accion='CREAR_PEDIDO_PROGRAMADO'")
        .get(),
    ).toEqual({ total: 1 });
  });

  it('lists scheduled orders by delivery time', async () => {
    await repository.create(createCommand(database));
    const items = await repository.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({ operationCode: 'PP-1', customerName: 'Ana' }),
    );
  });

  it('stores and returns a written custom size with its own price', async () => {
    const base = createCommand(database);
    const command: ScheduledOrderCommand = {
      ...base,
      input: {
        ...base.input,
        lines: [
          {
            customDescription: 'Kankacho entero',
            presentation: 'Entero grande',
            quantity: 2,
            unitPriceCents: 8500,
          },
        ],
      },
      detailIds: [{ principalId: 'detail-custom', addonIds: [] }],
    };

    const result = await repository.create(command);

    expect(result.totalCents).toBe(17000);
    expect(result.lines).toEqual([
      {
        name: 'Kankacho entero',
        presentation: 'Entero grande',
        quantity: 2,
        unitPriceCents: 8500,
        subtotalCents: 17000,
      },
    ]);
    expect(
      database.prepare('SELECT producto_nombre_snapshot,nota FROM operacion_detalles').get(),
    ).toEqual({ producto_nombre_snapshot: 'Kankacho entero', nota: 'Entero grande' });
  });

  it('records an advance in the journey where money was received', async () => {
    await repository.create(createCommand(database));
    const result = await repository.registerAdvance(advance('advance-1', 500));

    expect(result).toEqual(
      expect.objectContaining({ paidCents: 500, balanceCents: 1700, paymentState: 'CON_ADELANTO' }),
    );
    expect(database.prepare('SELECT jornada_id,tipo,importe_centimos FROM cobros').get()).toEqual({
      jornada_id: 'journey-1',
      tipo: 'ADELANTO_PEDIDO',
      importe_centimos: 500,
    });
    expect(database.prepare('SELECT monto_centimos FROM movimientos_caja').get()).toEqual({
      monto_centimos: 500,
    });
  });

  it('keeps preparation and payment states independent until delivery', async () => {
    await repository.create(createCommand(database));
    await transition(repository, 'PENDIENTE_DE_PREPARACION', 'step-1');
    await transition(repository, 'EN_PREPARACION', 'step-2');
    await transition(repository, 'LISTO', 'step-3');
    const delivered = await transition(repository, 'ENTREGADO', 'step-4');

    expect(delivered).toEqual(
      expect.objectContaining({
        preparationState: 'ENTREGADO',
        paymentState: 'PENDIENTE_DE_PAGO',
        balanceCents: 2200,
      }),
    );
    expect(
      database.prepare('SELECT jornada_entrega_id FROM pedido_programado_datos').get(),
    ).toEqual({ jornada_entrega_id: 'journey-1' });
    expect(database.prepare('SELECT estado,jornada_venta_id FROM operaciones').get()).toEqual({
      estado: 'ABIERTA',
      jornada_venta_id: null,
    });
  });

  it('recognizes the sale in the delivery journey and later money in the payment journey', async () => {
    await repository.create(createCommand(database));
    await repository.registerAdvance(advance('advance-1', 500));
    await transition(repository, 'PENDIENTE_DE_PREPARACION', 'step-1');
    await transition(repository, 'EN_PREPARACION', 'step-2');
    await transition(repository, 'LISTO', 'step-3');
    await transition(repository, 'ENTREGADO', 'step-4');
    openNextJourney(database);

    const paid = await repository.registerAdvance(advance('payment-2', 1700));

    expect(paid).toEqual(
      expect.objectContaining({
        preparationState: 'ENTREGADO',
        paymentState: 'PAGADO',
        balanceCents: 0,
      }),
    );
    expect(database.prepare('SELECT estado,jornada_venta_id FROM operaciones').get()).toEqual({
      estado: 'FINALIZADA',
      jornada_venta_id: 'journey-1',
    });
    expect(
      database
        .prepare("SELECT jornada_id,tipo FROM cobros WHERE clave_idempotencia='payment-2'")
        .get(),
    ).toEqual({ jornada_id: 'journey-2', tipo: 'PAGO_GENERAL_PEDIDO' });
  });
});

function createCommand(database: DatabaseSync): ScheduledOrderCommand {
  return {
    operationId: 'order-1',
    operationCode: 'PP-1',
    auditId: 'audit-create',
    input: {
      customerName: 'Ana',
      customerPhone: '999111222',
      scheduledLocal: '2026-07-31T12:30',
      deliveryType: 'RECOJO',
      address: null,
      reference: 'Recojo en puerta',
      idempotencyKey: 'create-1',
      lines: [
        {
          productId: product(database, 'KANKACHO_20'),
          quantity: 1,
          addons: [{ productId: product(database, 'PAPA_ADICIONAL_2'), quantity: 1 }],
        },
      ],
    },
    detailIds: [{ principalId: 'detail-main', addonIds: ['detail-addon'] }],
    actorUserId: 'cashier',
    occurredAtUtc: '2026-07-30T15:00:00Z',
  };
}

function advance(key: string, amount: number): ScheduledAdvanceCommand {
  return {
    operationId: 'order-1',
    paymentId: `charge-${key}`,
    auditId: `audit-${key}`,
    payments: [
      {
        methodCode: 'EFECTIVO',
        appliedCents: amount,
        receivedCents: amount,
        entryId: `entry-${key}`,
        movementId: `movement-${key}`,
      },
    ],
    actorUserId: 'cashier',
    idempotencyKey: key,
    occurredAtUtc: '2026-07-30T15:10:00Z',
  };
}

async function transition(
  repository: SqliteScheduledOrdersRepository,
  targetState: ScheduledTransitionCommand['targetState'],
  key: string,
) {
  return repository.transition({
    operationId: 'order-1',
    targetState,
    actorUserId: 'cashier',
    idempotencyKey: key,
    occurredAtUtc: '2026-07-30T16:00:00Z',
  });
}

function seed(database: DatabaseSync): void {
  const role = (
    database.prepare("SELECT id FROM roles WHERE codigo='CAJERO'").get() as { id: string }
  ).id;
  database
    .prepare(
      `INSERT INTO usuarios (id,rol_id,nombre_usuario,nombre_usuario_normalizado,nombre_mostrar,
       contrasena_hash,contrasena_sal,contrasena_algoritmo,activo,creado_en_utc,actualizado_en_utc)
       VALUES ('cashier',?,'Caja','caja','Caja','h','s','x',1,'now','now')`,
    )
    .run(role);
  database.exec(`INSERT INTO jornadas_caja
    (id,fecha_negocio,estado,monto_inicial_centimos,abierta_por_usuario_id,abierta_en_utc,clave_idempotencia,version)
    VALUES ('journey-1','2026-07-30','ABIERTA',0,'cashier','now','journey-key-1',1);`);
}

function openNextJourney(database: DatabaseSync): void {
  database.exec(`UPDATE jornadas_caja SET estado='CERRADA' WHERE id='journey-1';
    INSERT INTO jornadas_caja
    (id,fecha_negocio,estado,monto_inicial_centimos,abierta_por_usuario_id,abierta_en_utc,clave_idempotencia,version)
    VALUES ('journey-2','2026-07-31','ABIERTA',0,'cashier','later','journey-key-2',1);`);
}

function product(database: DatabaseSync, code: string): string {
  return (database.prepare('SELECT id FROM productos WHERE codigo=?').get(code) as { id: string })
    .id;
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
