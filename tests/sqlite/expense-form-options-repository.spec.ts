import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteExpenseFormOptionsRepository,
  type ExpenseOptionsQueryDatabase,
  type ExpenseOptionsQueryRow,
  type ExpenseOptionsQueryValue,
} from '../../src/app/core/expense/sqlite-expense-form-options.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import { MIGRATION_V3 } from '../../src/app/core/database/migrations/migration-v3';
import { MIGRATION_V4 } from '../../src/app/core/database/migrations/migration-v4';
import { MIGRATION_V5 } from '../../src/app/core/database/migrations/migration-v5';

describe('SqliteExpenseFormOptionsRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteExpenseFormOptionsRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    for (const migration of [
      MIGRATION_V1,
      MIGRATION_V2,
      MIGRATION_V3,
      MIGRATION_V4,
      MIGRATION_V5,
    ]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    repository = new SqliteExpenseFormOptionsRepository(new NodeOptionsDatabase(database));
  });

  afterEach(() => database.close());

  it('lists active categories and payment methods in configured order', async () => {
    const options = await repository.listActive();

    expect(options.categories.map(({ code, name }) => ({ code, name }))).toEqual([
      { code: 'INSUMOS', name: 'Compra de insumos' },
      { code: 'BEBIDAS', name: 'Compra de bebidas' },
      { code: 'SERVICIOS', name: 'Servicios' },
      { code: 'TRANSPORTE', name: 'Transporte' },
      { code: 'MANTENIMIENTO', name: 'Mantenimiento' },
      { code: 'PERDIDA_CONSUMO_NO_COBRADO', name: 'Pérdida o consumo no cobrado' },
      { code: 'OTROS', name: 'Otros' },
    ]);
    expect(options.paymentMethods.map(({ code, name }) => ({ code, name }))).toEqual([
      { code: 'EFECTIVO', name: 'Efectivo' },
      { code: 'YAPE', name: 'Yape' },
    ]);
  });

  it('excludes inactive options without deleting them', async () => {
    database.prepare("UPDATE categorias_gasto SET activo = 0 WHERE codigo = 'SERVICIOS'").run();
    database.prepare("UPDATE metodos_pago SET activo = 0 WHERE codigo = 'YAPE'").run();

    const options = await repository.listActive();

    expect(options.categories.map((category) => category.code)).not.toContain('SERVICIOS');
    expect(options.paymentMethods.map((method) => method.code)).toEqual(['EFECTIVO']);
  });
});

class NodeOptionsDatabase implements ExpenseOptionsQueryDatabase {
  constructor(private readonly database: DatabaseSync) {}

  async query(
    statement: string,
    values: readonly ExpenseOptionsQueryValue[] = [],
  ): Promise<readonly ExpenseOptionsQueryRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
}
