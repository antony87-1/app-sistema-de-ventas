import { InjectionToken } from '@angular/core';

import {
  ActiveExpenseCategoryNotFoundError,
  ActivePaymentMethodNotFoundError,
  ExpenseIdempotencyConflictError,
  ExpenseJourneyRequiredError,
  ExpenseNoteRequiredError,
  type ExpenseRegistrationCommand,
  type ExpenseRegistrationRepository,
  type RegisteredExpense,
} from '../../domain/expense/register-expense.use-case';

export const EXPENSE_REGISTRATION_REPOSITORY = new InjectionToken<ExpenseRegistrationRepository>(
  'EXPENSE_REGISTRATION_REPOSITORY',
);

export type ExpenseWriteValue = string | number | bigint | null | Uint8Array;
export type ExpenseWriteRow = Readonly<Record<string, ExpenseWriteValue>>;

export interface ExpenseWriteDatabase {
  query(
    statement: string,
    values?: readonly ExpenseWriteValue[],
  ): Promise<readonly ExpenseWriteRow[]>;
  run(statement: string, values?: readonly ExpenseWriteValue[]): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

export class SqliteExpenseRegistrationRepository implements ExpenseRegistrationRepository {
  constructor(private readonly database: ExpenseWriteDatabase) {}

  async register(command: ExpenseRegistrationCommand): Promise<RegisteredExpense> {
    await this.database.beginTransaction();
    try {
      const idempotentRows = await this.findByIdempotencyKey(command.idempotencyKey);
      if (idempotentRows.length > 0) {
        if (!isSameRequest(idempotentRows[0], command)) {
          throw new ExpenseIdempotencyConflictError();
        }
        const expense = mapExpense(idempotentRows[0]);
        await this.database.commitTransaction();
        return expense;
      }

      const journeyRows = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado = 'ABIERTA' LIMIT 1;`,
      );
      if (journeyRows.length === 0) throw new ExpenseJourneyRequiredError();
      const journeyId = requireString(journeyRows[0], 'id');

      const categoryRows = await this.database.query(
        `SELECT codigo, nombre FROM categorias_gasto WHERE id = ? AND activo = 1 LIMIT 1;`,
        [command.categoryId],
      );
      if (categoryRows.length === 0) throw new ActiveExpenseCategoryNotFoundError();
      const categoryCode = requireString(categoryRows[0], 'codigo');
      const categoryName = requireString(categoryRows[0], 'nombre');
      if (categoryCode === 'PERDIDA_CONSUMO_NO_COBRADO' && command.note === null) {
        throw new ExpenseNoteRequiredError();
      }

      const paymentRows = await this.database.query(
        `SELECT nombre FROM metodos_pago WHERE id = ? AND activo = 1 LIMIT 1;`,
        [command.paymentMethodId],
      );
      if (paymentRows.length === 0) throw new ActivePaymentMethodNotFoundError();
      const paymentMethodName = requireString(paymentRows[0], 'nombre');

      await this.database.run(
        `INSERT INTO gastos (
           id, jornada_id, categoria_gasto_id, metodo_pago_id, registrado_por_usuario_id,
           descripcion, monto_centimos, proveedor, nota, registrado_en_utc, clave_idempotencia
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          command.expenseId,
          journeyId,
          command.categoryId,
          command.paymentMethodId,
          command.actorUserId,
          command.description,
          command.amountCents,
          command.supplier,
          command.note,
          command.occurredAtUtc,
          command.idempotencyKey,
        ],
      );
      await this.database.run(
        `INSERT INTO movimientos_caja (
           id, jornada_id, metodo_pago_id, registrado_por_usuario_id, tipo,
           monto_centimos, cobro_metodo_id, gasto_id, correccion_id, ocurrido_en_utc
         ) VALUES (?, ?, ?, ?, 'SALIDA_GASTO', ?, NULL, ?, NULL, ?);`,
        [
          command.movementId,
          journeyId,
          command.paymentMethodId,
          command.actorUserId,
          command.amountCents,
          command.expenseId,
          command.occurredAtUtc,
        ],
      );
      await this.database.run(
        `INSERT INTO auditoria (
           id, usuario_id, jornada_id, accion, entidad_tipo, entidad_id,
           valores_anteriores_json, valores_nuevos_json, motivo, ocurrido_en_utc
         ) VALUES (?, ?, ?, 'REGISTRAR_GASTO', 'GASTO', ?, NULL, ?, NULL, ?);`,
        [
          command.auditId,
          command.actorUserId,
          journeyId,
          command.expenseId,
          JSON.stringify({
            categoria_gasto_id: command.categoryId,
            categoria_nombre: categoryName,
            metodo_pago_id: command.paymentMethodId,
            metodo_pago_nombre: paymentMethodName,
            descripcion: command.description,
            monto_centimos: command.amountCents,
            proveedor: command.supplier,
            nota: command.note,
          }),
          command.occurredAtUtc,
        ],
      );

      const createdRows = await this.findByIdempotencyKey(command.idempotencyKey);
      if (createdRows.length !== 1) throw new Error('No se pudo verificar el gasto creado.');
      const expense = mapExpense(createdRows[0]);
      await this.database.commitTransaction();
      return expense;
    } catch (error: unknown) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private findByIdempotencyKey(key: string): Promise<readonly ExpenseWriteRow[]> {
    return this.database.query(
      `SELECT g.id, g.jornada_id, g.categoria_gasto_id, cg.nombre AS categoria_nombre,
              g.metodo_pago_id, mp.nombre AS metodo_pago_nombre, g.descripcion,
              g.monto_centimos, g.proveedor, g.nota, g.registrado_por_usuario_id,
              g.registrado_en_utc, g.clave_idempotencia
         FROM gastos g
         JOIN categorias_gasto cg ON cg.id = g.categoria_gasto_id
         JOIN metodos_pago mp ON mp.id = g.metodo_pago_id
        WHERE g.clave_idempotencia = ?
        LIMIT 1;`,
      [key],
    );
  }
}

function isSameRequest(row: ExpenseWriteRow, command: ExpenseRegistrationCommand): boolean {
  return (
    row['categoria_gasto_id'] === command.categoryId &&
    row['metodo_pago_id'] === command.paymentMethodId &&
    row['descripcion'] === command.description &&
    row['monto_centimos'] === command.amountCents &&
    row['proveedor'] === command.supplier &&
    row['nota'] === command.note &&
    row['registrado_por_usuario_id'] === command.actorUserId
  );
}

function mapExpense(row: ExpenseWriteRow): RegisteredExpense {
  return {
    id: requireString(row, 'id'),
    journeyId: requireString(row, 'jornada_id'),
    categoryId: requireString(row, 'categoria_gasto_id'),
    categoryName: requireString(row, 'categoria_nombre'),
    paymentMethodId: requireString(row, 'metodo_pago_id'),
    paymentMethodName: requireString(row, 'metodo_pago_nombre'),
    description: requireString(row, 'descripcion'),
    amountCents: requirePositiveInteger(row, 'monto_centimos'),
    supplier: optionalString(row, 'proveedor'),
    note: optionalString(row, 'nota'),
    registeredByUserId: requireString(row, 'registrado_por_usuario_id'),
    registeredAtUtc: requireString(row, 'registrado_en_utc'),
  };
}

function requireString(row: ExpenseWriteRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El campo ${key} del gasto no es válido.`);
  }
  return value;
}

function optionalString(row: ExpenseWriteRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El campo ${key} del gasto no es válido.`);
  }
  return value;
}

function requirePositiveInteger(row: ExpenseWriteRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`El campo ${key} del gasto no es válido.`);
  }
  return value;
}
