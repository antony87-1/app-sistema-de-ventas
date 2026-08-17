import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_MIGRATIONS } from '../../src/app/core/database/migrations';
import { SqliteServiceTablesRepository } from '../../src/app/core/table/sqlite-service-tables.repository';
import { SqliteTableAccountRepository } from '../../src/app/core/table/sqlite-table-account.repository';
import { SqliteTableAccountManagementRepository } from '../../src/app/core/table/sqlite-table-account-management.repository';
import { SqliteTableAccountPaymentRepository } from '../../src/app/core/table/sqlite-table-account-payment.repository';
import type {
  QuickSaleDatabase,
  QuickSaleRow,
  QuickSaleValue,
} from '../../src/app/core/sale/sqlite-quick-sale.repository';
import {
  TableAccountIdempotencyConflictError,
  TableAccountLimitError,
  type OpenTableAccountCommand,
} from '../../src/app/domain/table/open-table-account.use-case';
import { TableAccountMutationIdempotencyConflictError } from '../../src/app/domain/table/manage-table-account.use-case';

describe('SQLite table service repositories', () => {
  let db: DatabaseSync;
  let listRepository: SqliteServiceTablesRepository;
  let accountRepository: SqliteTableAccountRepository;
  let managementRepository: SqliteTableAccountManagementRepository;
  let paymentRepository: SqliteTableAccountPaymentRepository;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    for (const migration of DATABASE_MIGRATIONS)
      for (const sql of migration.statements) db.exec(sql);
    seed(db);
    const adapter = new NodeDatabase(db);
    listRepository = new SqliteServiceTablesRepository(adapter);
    accountRepository = new SqliteTableAccountRepository(adapter);
    managementRepository = new SqliteTableAccountManagementRepository(adapter);
    paymentRepository = new SqliteTableAccountPaymentRepository(adapter);
  });
  afterEach(() => db.close());

  it('opens two ordered accounts atomically and rejects a third', async () => {
    expect(await accountRepository.open(command('one', 'op-1', 'CM-1'))).toEqual(
      expect.objectContaining({ accountLabel: 'Cuenta A' }),
    );
    expect(await accountRepository.open(command('two', 'op-2', 'CM-2'))).toEqual(
      expect.objectContaining({ accountLabel: 'Cuenta B' }),
    );
    await expect(accountRepository.open(command('three', 'op-3', 'CM-3'))).rejects.toBeInstanceOf(
      TableAccountLimitError,
    );
    const tables = await listRepository.list();
    expect(tables[0]).toEqual(
      expect.objectContaining({ name: 'Mesa 1', state: 'OCUPADA', balanceCents: 0 }),
    );
    expect(tables[0].accounts.map((account) => account.label)).toEqual(['Cuenta A', 'Cuenta B']);
    expect(
      db.prepare("SELECT COUNT(*) AS total FROM auditoria WHERE accion='ABRIR_CUENTA_MESA'").get(),
    ).toEqual({ total: 2 });
  });

  it('repeats the same request safely and rejects changed content', async () => {
    const request = command('same', 'op-1', 'CM-1');
    const first = await accountRepository.open(request);
    expect(await accountRepository.open({ ...request, operationId: 'ignored' })).toEqual(first);
    await expect(accountRepository.open({ ...request, tableId: 'table-2' })).rejects.toBeInstanceOf(
      TableAccountIdempotencyConflictError,
    );
  });

  it('represents joined tables once under the principal name', async () => {
    await accountRepository.open(command('joined', 'op-1', 'CM-1'));
    db.prepare(
      `INSERT INTO operacion_mesas (id,operacion_id,mesa_id,rol_mesa,vinculada_por_usuario_id,vinculada_en_utc)
      VALUES ('link-2','op-1','table-2','VINCULADA','cashier','2026-07-30T10:01:00Z')`,
    ).run();
    const tables = await listRepository.list();
    expect(tables).toHaveLength(1);
    expect(tables[0].joinedName).toBe('Mesa 1 + Mesa 2');
  });

  it('adds and loads a principal product with its addon and frozen totals', async () => {
    await accountRepository.open(command('account', 'op-1', 'CM-1'));
    const snapshot = await managementRepository.add(addCommand(db, 'add-1'));
    expect(snapshot.totalCents).toBe(2200);
    expect(snapshot.lines[0].addons).toHaveLength(1);
    expect((await managementRepository.load('op-1')).principalTableName).toBe('Mesa 1');
  });

  it('adds a requested addon as a child of an existing pending principal', async () => {
    await accountRepository.open(command('account', 'op-1', 'CM-1'));
    const request = addCommand(db, 'main-only');
    await managementRepository.add({
      ...request,
      lines: [{ ...request.lines![0], addons: [] }],
      generatedDetailIds: [{ principalId: 'detail-main', addonIds: [] }],
    });
    const addon = (
      db.prepare("SELECT id FROM productos WHERE codigo='PAPA_ADICIONAL_2'").get() as { id: string }
    ).id;
    const snapshot = await managementRepository.addAddon(
      mutation('addon-1', {
        detailId: 'detail-main',
        addonProductId: addon,
        generatedDetailIds: [{ principalId: 'new-addon', addonIds: [] }],
      }),
    );
    expect(snapshot.totalCents).toBe(2200);
    expect(snapshot.lines[0].addons[0].detailId).toBe('new-addon');
  });

  it('changes and removes an unserved unpaid principal with its children', async () => {
    await accountRepository.open(command('account', 'op-1', 'CM-1'));
    await managementRepository.add(addCommand(db, 'add-1'));
    expect(
      (
        await managementRepository.changeQuantity(
          mutation('quantity-1', { detailId: 'detail-main', targetQuantity: 2 }),
        )
      ).totalCents,
    ).toBe(4200);
    expect(
      (
        await managementRepository.changeQuantity(
          mutation('quantity-2', { detailId: 'detail-main', targetQuantity: 0 }),
        )
      ).lines,
    ).toEqual([]);
  });

  it('edits and restores the justified price of a pending account line', async () => {
    await accountRepository.open(command('account', 'op-1', 'CM-1'));
    await managementRepository.add(addCommand(db, 'add-1'));

    const adjusted = await managementRepository.changePrice(
      mutation('price-1', {
        detailId: 'detail-main',
        priceAdjustment: {
          type: 'DESCUENTO',
          appliedPriceCents: 1800,
          reason: 'Promoción del día',
        },
      }),
    );
    expect(adjusted.totalCents).toBe(2000);
    expect(adjusted.lines[0]).toEqual(
      expect.objectContaining({
        unitPriceCents: 1800,
        subtotalCents: 1800,
        priceAdjustment: { type: 'DESCUENTO', reason: 'Promoción del día' },
      }),
    );

    const restored = await managementRepository.changePrice(
      mutation('price-2', { detailId: 'detail-main', priceAdjustment: null }),
    );
    expect(restored.totalCents).toBe(2200);
    expect(restored.lines[0].priceAdjustment).toBeNull();
    expect(restored.lines[0].unitPriceCents).toBe(2000);
  });

  it('marks the principal and its addons served and locks later quantity editing', async () => {
    await accountRepository.open(command('account', 'op-1', 'CM-1'));
    await managementRepository.add(addCommand(db, 'add-1'));
    const served = await managementRepository.markServed(
      mutation('serve-1', { detailId: 'detail-main' }),
    );
    expect(served.lines[0].serviceState).toBe('SERVIDO');
    expect(served.lines[0].addons[0].serviceState).toBe('SERVIDO');
    await expect(
      managementRepository.changeQuantity(
        mutation('quantity-1', { detailId: 'detail-main', targetQuantity: 2 }),
      ),
    ).rejects.toThrow();
  });

  it('links and releases a free table without moving products or the principal table', async () => {
    await accountRepository.open(command('account', 'op-1', 'CM-1'));
    expect(
      (await managementRepository.linkTable(mutation('join-1', { tableId: 'table-2' })))
        .linkedTables[0].name,
    ).toBe('Mesa 2');
    expect(
      (await managementRepository.unlinkTable(mutation('split-1', { tableId: 'table-2' })))
        .linkedTables,
    ).toEqual([]);
    expect((await managementRepository.load('op-1')).principalTableId).toBe('table-1');
  });

  it('makes account mutations idempotent and rejects changed content under the same key', async () => {
    await accountRepository.open(command('account', 'op-1', 'CM-1'));
    const request = addCommand(db, 'same-add');
    await managementRepository.add(request);
    await managementRepository.add({
      ...request,
      occurredAtUtc: 'later',
      generatedDetailIds: [{ principalId: 'ignored', addonIds: ['ignored-addon'] }],
    });
    await expect(
      managementRepository.add({ ...request, lines: [{ ...request.lines![0], quantity: 2 }] }),
    ).rejects.toBeInstanceOf(TableAccountMutationIdempotencyConflictError);
    expect(db.prepare('SELECT COUNT(*) AS total FROM operacion_detalles').get()).toEqual({
      total: 2,
    });
  });

  it('rejects a payment quantity greater than the concrete unpaid product quantity', async () => {
    await preparePayableAccount(db, accountRepository, managementRepository);
    await expect(
      paymentRepository.pay(
        payment(
          'pay-invalid',
          [{ detailId: 'detail-main', quantity: 4 }],
          [{ methodCode: 'EFECTIVO', appliedCents: 8000, receivedCents: 8000 }],
        ),
      ),
    ).rejects.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS total FROM cobros').get()).toEqual({ total: 0 });
  });

  it('calculates and records a partial payment from exact product quantities', async () => {
    await preparePayableAccount(db, accountRepository, managementRepository);
    const result = await paymentRepository.pay(
      payment(
        'pay-partial',
        [{ detailId: 'detail-main', quantity: 2 }],
        [{ methodCode: 'EFECTIVO', appliedCents: 4000, receivedCents: 5000 }],
      ),
    );
    expect(result).toEqual(
      expect.objectContaining({
        amountCents: 4000,
        balanceCents: 2200,
        state: 'PAGADA_PARCIALMENTE',
        changeCents: 1000,
      }),
    );
    expect(
      db.prepare("SELECT cantidad_pagada FROM operacion_detalles WHERE id='detail-main'").get(),
    ).toEqual({ cantidad_pagada: 2 });
  });

  it('records one selected payment using both cash and Yape movements', async () => {
    await preparePayableAccount(db, accountRepository, managementRepository);
    const result = await paymentRepository.pay(
      payment(
        'pay-combined',
        [
          { detailId: 'detail-main', quantity: 1 },
          { detailId: 'detail-addon', quantity: 1 },
        ],
        [
          { methodCode: 'EFECTIVO', appliedCents: 1200, receivedCents: 1500 },
          { methodCode: 'YAPE', appliedCents: 1000, receivedCents: 1000 },
        ],
      ),
    );
    expect(result.changeCents).toBe(300);
    expect(db.prepare('SELECT COUNT(*) AS total FROM movimientos_caja').get()).toEqual({
      total: 2,
    });
  });

  it('keeps a fully paid table account open until attention is explicitly finalized', async () => {
    await preparePayableAccount(db, accountRepository, managementRepository);
    await paymentRepository.pay(
      payment(
        'pay-all',
        [
          { detailId: 'detail-main', quantity: 3 },
          { detailId: 'detail-addon', quantity: 1 },
        ],
        [{ methodCode: 'YAPE', appliedCents: 6200, receivedCents: 6200 }],
      ),
    );
    expect(db.prepare("SELECT estado FROM operaciones WHERE id='op-1'").get()).toEqual({
      estado: 'PAGADA',
    });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS total FROM operacion_mesas WHERE operacion_id='op-1' AND liberada_en_utc IS NULL",
        )
        .get(),
    ).toEqual({ total: 1 });
  });

  it('finalizes a paid attention, recognizes the sale and releases every linked table idempotently', async () => {
    await preparePayableAccount(db, accountRepository, managementRepository);
    await managementRepository.linkTable(mutation('join-before-final', { tableId: 'table-2' }));
    await paymentRepository.pay(
      payment(
        'pay-all',
        [
          { detailId: 'detail-main', quantity: 3 },
          { detailId: 'detail-addon', quantity: 1 },
        ],
        [{ methodCode: 'YAPE', appliedCents: 6200, receivedCents: 6200 }],
      ),
    );
    const command = {
      operationId: 'op-1',
      actorUserId: 'cashier',
      idempotencyKey: 'final-1',
      finalizedAtUtc: '2026-07-30T12:00:00Z',
    };
    const first = await paymentRepository.finalize(command);
    expect(await paymentRepository.finalize({ ...command, finalizedAtUtc: 'later' })).toEqual(
      first,
    );
    expect(first.releasedTableIds).toEqual(['table-1', 'table-2']);
    expect(
      db.prepare("SELECT estado,jornada_venta_id FROM operaciones WHERE id='op-1'").get(),
    ).toEqual({ estado: 'FINALIZADA', jornada_venta_id: 'journey-1' });
  });
});

async function preparePayableAccount(
  db: DatabaseSync,
  accounts: SqliteTableAccountRepository,
  management: SqliteTableAccountManagementRepository,
) {
  await accounts.open(command('account', 'op-1', 'CM-1'));
  const request = addCommand(db, 'add-payable');
  await management.add({ ...request, lines: [{ ...request.lines![0], quantity: 3 }] });
}
function payment(
  key: string,
  selections: { detailId: string; quantity: number }[],
  methods: { methodCode: 'EFECTIVO' | 'YAPE'; appliedCents: number; receivedCents: number }[],
) {
  return {
    paymentId: `cobro-${key}`,
    auditId: `audit-${key}`,
    operationId: 'op-1',
    selections,
    payments: methods.map((item, index) => ({
      ...item,
      entryId: `entry-${key}-${index}`,
      movementId: `movement-${key}-${index}`,
    })),
    actorUserId: 'cashier',
    idempotencyKey: key,
    confirmedAtUtc: '2026-07-30T11:30:00Z',
  };
}

function mutation(
  key: string,
  extra: Partial<
    import('../../src/app/domain/table/manage-table-account.use-case').TableAccountMutationCommand
  >,
) {
  return {
    operationId: 'op-1',
    requestKey: key,
    actorUserId: 'cashier',
    occurredAtUtc: '2026-07-30T11:00:00Z',
    ...extra,
  };
}
function addCommand(db: DatabaseSync, key: string) {
  const main = (
    db.prepare("SELECT id FROM productos WHERE codigo='KANKACHO_20'").get() as { id: string }
  ).id;
  const addon = (
    db.prepare("SELECT id FROM productos WHERE codigo='PAPA_ADICIONAL_2'").get() as { id: string }
  ).id;
  return mutation(key, {
    lines: [{ productId: main, quantity: 1, addons: [{ productId: addon, quantity: 1 }] }],
    generatedDetailIds: [{ principalId: 'detail-main', addonIds: ['detail-addon'] }],
  });
}

function command(key: string, operationId: string, code: string): OpenTableAccountCommand {
  return {
    operationId,
    operationCode: code,
    associationId: `link-${operationId}`,
    auditId: `audit-${operationId}`,
    tableId: 'table-1',
    note: null,
    idempotencyKey: key,
    actorUserId: 'cashier',
    createdAtUtc: `2026-07-30T10:0${operationId.endsWith('2') ? '2' : '1'}:00Z`,
  };
}
function seed(db: DatabaseSync): void {
  const role = (db.prepare("SELECT id FROM roles WHERE codigo='CAJERO'").get() as { id: string })
    .id;
  db.prepare(
    `INSERT INTO usuarios (id,rol_id,nombre_usuario,nombre_usuario_normalizado,nombre_mostrar,
    contrasena_hash,contrasena_sal,contrasena_algoritmo,activo,creado_en_utc,actualizado_en_utc)
    VALUES ('cashier',?,'Caja','caja','Caja','h','s','x',1,'now','now')`,
  ).run(role);
  db.exec(`INSERT INTO jornadas_caja (id,fecha_negocio,estado,monto_inicial_centimos,abierta_por_usuario_id,abierta_en_utc,clave_idempotencia,version)
    VALUES ('journey-1','2026-07-30','ABIERTA',0,'cashier','now','journey-key',1);
    INSERT INTO mesas (id,codigo,nombre,orden,activo,creado_en_utc,actualizado_en_utc) VALUES
    ('table-1','M1','Mesa 1',1,1,'now','now'),('table-2','M2','Mesa 2',2,1,'now','now');`);
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
  async run(sql: string, values: readonly QuickSaleValue[] = []): Promise<void> {
    this.db.prepare(sql).run(...([...values] as SQLInputValue[]));
  }
  async beginTransaction(): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
  }
  async commitTransaction(): Promise<void> {
    this.db.exec('COMMIT');
  }
  async rollbackTransaction(): Promise<void> {
    this.db.exec('ROLLBACK');
  }
}
