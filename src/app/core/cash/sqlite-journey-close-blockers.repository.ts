import { InjectionToken } from '@angular/core';

import type {
  JourneyCloseBlockersRepository,
  OpenTableBlockerData,
  OperationalCloseBlockers,
  PendingAccountBlockerData,
} from '../../domain/cash/evaluate-journey-close-readiness.use-case';

export const JOURNEY_CLOSE_BLOCKERS_REPOSITORY = new InjectionToken<JourneyCloseBlockersRepository>(
  'JOURNEY_CLOSE_BLOCKERS_REPOSITORY',
);

export type CloseBlockersQueryValue = string | number | bigint | null | Uint8Array;
export type CloseBlockersQueryRow = Readonly<Record<string, CloseBlockersQueryValue>>;

export interface CloseBlockersQueryDatabase {
  query(
    statement: string,
    values?: readonly CloseBlockersQueryValue[],
  ): Promise<readonly CloseBlockersQueryRow[]>;
}

export class SqliteJourneyCloseBlockersRepository implements JourneyCloseBlockersRepository {
  constructor(private readonly database: CloseBlockersQueryDatabase) {}

  async listOperationalBlockers(journeyId: string): Promise<OperationalCloseBlockers> {
    const [tableRows, accountRows] = await Promise.all([
      this.database.query(
        `SELECT o.id AS operacion_id, o.codigo AS operacion_codigo, m.nombre AS mesa_nombre
           FROM operaciones o
           JOIN operacion_mesas om ON om.operacion_id = o.id AND om.liberada_en_utc IS NULL
           JOIN mesas m ON m.id = om.mesa_id
          WHERE o.jornada_creacion_id = ?
            AND o.tipo = 'CUENTA_MESA'
            AND o.estado NOT IN ('FINALIZADA', 'ANULADA')
          ORDER BY m.orden, o.codigo;`,
        [journeyId],
      ),
      this.database.query(
        `SELECT id AS operacion_id, codigo AS operacion_codigo, saldo_centimos
           FROM operaciones
          WHERE jornada_creacion_id = ?
            AND tipo IN ('VENTA_RAPIDA', 'CUENTA_MESA')
            AND estado NOT IN ('FINALIZADA', 'ANULADA')
            AND saldo_centimos > 0
          ORDER BY creada_en_utc, codigo;`,
        [journeyId],
      ),
    ]);
    return {
      openTables: tableRows.map(mapOpenTable),
      pendingAccounts: accountRows.map(mapPendingAccount),
    };
  }
}

function mapOpenTable(row: CloseBlockersQueryRow): OpenTableBlockerData {
  return {
    operationId: requireString(row, 'operacion_id'),
    operationCode: requireString(row, 'operacion_codigo'),
    tableName: requireString(row, 'mesa_nombre'),
  };
}

function mapPendingAccount(row: CloseBlockersQueryRow): PendingAccountBlockerData {
  return {
    operationId: requireString(row, 'operacion_id'),
    operationCode: requireString(row, 'operacion_codigo'),
    balanceCents: requirePositiveInteger(row, 'saldo_centimos'),
  };
}

function requireString(row: CloseBlockersQueryRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El campo ${key} del bloqueo de cierre no es válido.`);
  }
  return value;
}

function requirePositiveInteger(row: CloseBlockersQueryRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`El campo ${key} del bloqueo de cierre no es válido.`);
  }
  return value;
}
