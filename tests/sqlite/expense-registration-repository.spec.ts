import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteExpenseRegistrationRepository,
  type ExpenseWriteDatabase,
  type ExpenseWriteRow,
  type ExpenseWriteValue,
} from '../../src/app/core/expense/sqlite-expense-registration.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import { MIGRATION_V3 } from '../../src/app/core/database/migrations/migration-v3';
import { MIGRATION_V4 } from '../../src/app/core/database/migrations/migration-v4';
import {
  ActiveExpenseCategoryNotFoundError,
  ActivePaymentMethodNotFoundError,
  ExpenseIdempotencyConflictError,
  ExpenseJourneyRequiredError,
  ExpenseNoteRequiredError,
  type ExpenseRegistrationCommand,
} from '../../src/app/domain/expense/register-expense.use-case';

const NOW = '2026-07-30T00:00:00.000Z';

describe('SqliteExpenseRegistrationRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteExpenseRegistrationRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    insertCashier(database);
    insertOpenJourney(database);
    repository = new SqliteExpenseRegistrationRepository(new NodeExpenseWriteDatabase(database));
  });

  afterEach(() => database.close());

  it('persists expense, cash movement and audit in one transaction', async () => {
    const input = command(database);

    await expect(repository.register(input)).resolves.toMatchObject({
      id: 'expense-1',
      journeyId: 'journey-1',
      categoryName: 'Compra de insumos',
      paymentMethodName: 'Efectivo',
      amountCents: 5000,
    });
    expect(database.prepare('SELECT COUNT(*) AS total FROM gastos').get()).toEqual({ total: 1 });
    expect(
      database
        .prepare(
          `SELECT jornada_id, metodo_pago_id, registrado_por_usuario_id, tipo,
                  monto_centimos, gasto_id, ocurrido_en_utc
             FROM movimientos_caja WHERE id = 'movement-1'`,
        )
        .get(),
    ).toEqual({
      jornada_id: 'journey-1',
      metodo_pago_id: input.paymentMethodId,
      registrado_por_usuario_id: 'user-cashier',
      tipo: 'SALIDA_GASTO',
      monto_centimos: 5000,
      gasto_id: 'expense-1',
      ocurrido_en_utc: NOW,
    });
    expect(
      database
        .prepare(
          `SELECT jornada_id, accion, entidad_tipo, entidad_id
             FROM auditoria WHERE id = 'audit-1'`,
        )
        .get(),
    ).toEqual({
      jornada_id: 'journey-1',
      accion: 'REGISTRAR_GASTO',
      entidad_tipo: 'GASTO',
      entidad_id: 'expense-1',
    });
  });

  it('requires an open journey', async () => {
    database.prepare("UPDATE jornadas_caja SET estado = 'CERRADA'").run();

    await expect(repository.register(command(database))).rejects.toBeInstanceOf(
      ExpenseJourneyRequiredError,
    );
  });

  it('rejects inactive categories and payment methods', async () => {
    const inactiveCategory = command(database);
    database
      .prepare('UPDATE categorias_gasto SET activo = 0 WHERE id = ?')
      .run(inactiveCategory.categoryId);
    await expect(repository.register(inactiveCategory)).rejects.toBeInstanceOf(
      ActiveExpenseCategoryNotFoundError,
    );

    database
      .prepare('UPDATE categorias_gasto SET activo = 1 WHERE id = ?')
      .run(inactiveCategory.categoryId);
    const inactivePayment = command(database);
    database
      .prepare('UPDATE metodos_pago SET activo = 0 WHERE id = ?')
      .run(inactivePayment.paymentMethodId);
    await expect(repository.register(inactivePayment)).rejects.toBeInstanceOf(
      ActivePaymentMethodNotFoundError,
    );
    expect(database.prepare('SELECT COUNT(*) AS total FROM gastos').get()).toEqual({ total: 0 });
  });

  it('requires a note for loss or unpaid consumption', async () => {
    const lossCategoryId = findId(database, 'categorias_gasto', 'PERDIDA_CONSUMO_NO_COBRADO');

    await expect(
      repository.register({ ...command(database), categoryId: lossCategoryId, note: null }),
    ).rejects.toBeInstanceOf(ExpenseNoteRequiredError);
  });

  it('returns the original expense for an identical retry without duplicates', async () => {
    const input = command(database);
    const first = await repository.register(input);
    const retry = await repository.register({
      ...input,
      expenseId: 'expense-retry',
      movementId: 'movement-retry',
      auditId: 'audit-retry',
    });

    expect(retry).toEqual(first);
    expect(database.prepare('SELECT COUNT(*) AS total FROM gastos').get()).toEqual({ total: 1 });
    expect(database.prepare('SELECT COUNT(*) AS total FROM movimientos_caja').get()).toEqual({
      total: 1,
    });
    expect(database.prepare('SELECT COUNT(*) AS total FROM auditoria').get()).toEqual({ total: 1 });
  });

  it('rejects reuse of an idempotency key with different data', async () => {
    const input = command(database);
    await repository.register(input);

    await expect(
      repository.register({ ...input, expenseId: 'expense-2', amountCents: 6000 }),
    ).rejects.toBeInstanceOf(ExpenseIdempotencyConflictError);
  });

  it('rolls back expense and movement when audit insertion fails', async () => {
    insertConflictingAudit(database);

    await expect(repository.register(command(database))).rejects.toThrow();
    expect(database.prepare('SELECT COUNT(*) AS total FROM gastos').get()).toEqual({ total: 0 });
    expect(database.prepare('SELECT COUNT(*) AS total FROM movimientos_caja').get()).toEqual({
      total: 0,
    });
  });
});

class NodeExpenseWriteDatabase implements ExpenseWriteDatabase {
  private transactionActive = false;

  constructor(private readonly database: DatabaseSync) {}

  async query(
    statement: string,
    values: readonly ExpenseWriteValue[] = [],
  ): Promise<readonly ExpenseWriteRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }

  async run(statement: string, values: readonly ExpenseWriteValue[] = []): Promise<void> {
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

function command(database: DatabaseSync): ExpenseRegistrationCommand {
  return {
    expenseId: 'expense-1',
    movementId: 'movement-1',
    auditId: 'audit-1',
    categoryId: findId(database, 'categorias_gasto', 'INSUMOS'),
    paymentMethodId: findId(database, 'metodos_pago', 'EFECTIVO'),
    description: 'Compra de carbón',
    amountCents: 5000,
    supplier: 'Mercado local',
    note: null,
    idempotencyKey: 'request-1',
    actorUserId: 'user-cashier',
    occurredAtUtc: NOW,
  };
}

function findId(database: DatabaseSync, table: string, code: string): string {
  return String(
    (database.prepare(`SELECT id FROM ${table} WHERE codigo = ?`).get(code) as { id: string }).id,
  );
}

function insertCashier(database: DatabaseSync): void {
  const roleId = findId(database, 'roles', 'CAJERO');
  database
    .prepare(
      `INSERT INTO usuarios (
        id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
        contrasena_hash, contrasena_sal, contrasena_algoritmo, activo,
        creado_en_utc, actualizado_en_utc
      ) VALUES ('user-cashier', ?, 'Caja', 'caja', 'Caja', 'hash', 'salt', 'fixture', 1, ?, ?);`,
    )
    .run(roleId, NOW, NOW);
}

function insertOpenJourney(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO jornadas_caja (
        id, fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
        abierta_en_utc, clave_idempotencia, version
      ) VALUES ('journey-1', '2026-07-29', 'ABIERTA', 0, 'user-cashier', ?, 'journey-key', 1);`,
    )
    .run(NOW);
}

function insertConflictingAudit(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO auditoria (
        id, usuario_id, jornada_id, accion, entidad_tipo, entidad_id, ocurrido_en_utc
      ) VALUES ('audit-1', 'user-cashier', 'journey-1', 'FIXTURE', 'USUARIO', 'user-cashier', ?);`,
    )
    .run(NOW);
}
