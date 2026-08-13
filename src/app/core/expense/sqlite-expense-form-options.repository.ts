import { InjectionToken } from '@angular/core';

import type {
  ExpenseCategoryOption,
  ExpenseFormOptions,
  ExpenseFormOptionsRepository,
  ExpensePaymentMethodOption,
} from '../../domain/expense/list-expense-form-options.use-case';

export const EXPENSE_FORM_OPTIONS_REPOSITORY = new InjectionToken<ExpenseFormOptionsRepository>(
  'EXPENSE_FORM_OPTIONS_REPOSITORY',
);

export type ExpenseOptionsQueryValue = string | number | bigint | null | Uint8Array;
export type ExpenseOptionsQueryRow = Readonly<Record<string, ExpenseOptionsQueryValue>>;

export interface ExpenseOptionsQueryDatabase {
  query(
    statement: string,
    values?: readonly ExpenseOptionsQueryValue[],
  ): Promise<readonly ExpenseOptionsQueryRow[]>;
}

export class SqliteExpenseFormOptionsRepository implements ExpenseFormOptionsRepository {
  constructor(private readonly database: ExpenseOptionsQueryDatabase) {}

  async listActive(): Promise<ExpenseFormOptions> {
    const [categoryRows, paymentRows] = await Promise.all([
      this.database.query(
        `SELECT id, codigo, nombre
           FROM categorias_gasto
          WHERE activo = 1
          ORDER BY orden, nombre_normalizado;`,
      ),
      this.database.query(
        `SELECT id, codigo, nombre
           FROM metodos_pago
          WHERE activo = 1
          ORDER BY orden, nombre;`,
      ),
    ]);

    return {
      categories: categoryRows.map(mapCategory),
      paymentMethods: paymentRows.map(mapPaymentMethod),
    };
  }
}

function mapCategory(row: ExpenseOptionsQueryRow): ExpenseCategoryOption {
  return {
    id: requireString(row, 'id'),
    code: requireString(row, 'codigo'),
    name: requireString(row, 'nombre'),
  };
}

function mapPaymentMethod(row: ExpenseOptionsQueryRow): ExpensePaymentMethodOption {
  return {
    id: requireString(row, 'id'),
    code: requireString(row, 'codigo'),
    name: requireString(row, 'nombre'),
  };
}

function requireString(row: ExpenseOptionsQueryRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`La opción ${key} del gasto no es válida.`);
  }
  return value;
}
