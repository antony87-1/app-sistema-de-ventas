import { InjectionToken } from '@angular/core';

import type {
  CashMethodSummary,
  CashSummaryRepository,
  OpenCashSummary,
} from '../../domain/cash/get-open-cash-summary.use-case';

export const CASH_SUMMARY_REPOSITORY = new InjectionToken<CashSummaryRepository>(
  'CASH_SUMMARY_REPOSITORY',
);

export type CashSummaryQueryValue = string | number | bigint | null | Uint8Array;
export type CashSummaryQueryRow = Readonly<Record<string, CashSummaryQueryValue>>;

export interface CashSummaryQueryDatabase {
  query(
    statement: string,
    values?: readonly CashSummaryQueryValue[],
  ): Promise<readonly CashSummaryQueryRow[]>;
}

export class SqliteCashSummaryRepository implements CashSummaryRepository {
  constructor(private readonly database: CashSummaryQueryDatabase) {}

  async findOpen(): Promise<OpenCashSummary | null> {
    const rows = await this.database.query(
      `SELECT j.id AS jornada_id, j.fecha_negocio, j.monto_inicial_centimos,
              mp.id AS metodo_id, mp.codigo AS metodo_codigo, mp.nombre AS metodo_nombre,
              COALESCE(SUM(CASE
                WHEN m.tipo IN ('INGRESO_COBRO', 'CORRECCION_ENTRADA') THEN m.monto_centimos
                ELSE 0
              END), 0) AS ingresos_centimos,
              COALESCE(SUM(CASE
                WHEN m.tipo IN ('SALIDA_GASTO', 'CORRECCION_SALIDA') THEN m.monto_centimos
                ELSE 0
              END), 0) AS salidas_centimos
         FROM jornadas_caja j
         CROSS JOIN metodos_pago mp
         LEFT JOIN movimientos_caja m
           ON m.jornada_id = j.id AND m.metodo_pago_id = mp.id
        WHERE j.estado = 'ABIERTA'
          AND (mp.activo = 1 OR m.id IS NOT NULL)
        GROUP BY j.id, j.fecha_negocio, j.monto_inicial_centimos,
                 mp.id, mp.codigo, mp.nombre, mp.orden
        ORDER BY mp.orden, mp.nombre;`,
    );
    if (rows.length === 0) return null;

    const methods = rows.map(mapMethod);
    const cashNetCents = methods.find((method) => method.code === 'EFECTIVO')?.netCents ?? 0;
    const initialCashCents = requireNonNegativeInteger(rows[0], 'monto_inicial_centimos');
    return {
      journeyId: requireString(rows[0], 'jornada_id'),
      businessDate: requireString(rows[0], 'fecha_negocio'),
      initialCashCents,
      expectedCashCents: initialCashCents + cashNetCents,
      methods,
    };
  }
}

function mapMethod(row: CashSummaryQueryRow): CashMethodSummary {
  const inflowCents = requireNonNegativeInteger(row, 'ingresos_centimos');
  const outflowCents = requireNonNegativeInteger(row, 'salidas_centimos');
  return {
    id: requireString(row, 'metodo_id'),
    code: requireString(row, 'metodo_codigo'),
    name: requireString(row, 'metodo_nombre'),
    inflowCents,
    outflowCents,
    netCents: inflowCents - outflowCents,
  };
}

function requireString(row: CashSummaryQueryRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El campo ${key} del resumen de caja no es válido.`);
  }
  return value;
}

function requireNonNegativeInteger(row: CashSummaryQueryRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`El campo ${key} del resumen de caja no es válido.`);
  }
  return value;
}
