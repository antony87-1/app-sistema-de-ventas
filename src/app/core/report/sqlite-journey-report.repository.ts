import { InjectionToken } from '@angular/core';

import type { QuickSaleDatabase, QuickSaleRow } from '../sale/sqlite-quick-sale.repository';
import type {
  CashReportMethod,
  CashReportMovement,
  JourneyReport,
  JourneyReportRepository,
  ReportJourney,
  SalesReportOperation,
  SalesReportType,
} from '../../domain/report/get-journey-report.use-case';

export const JOURNEY_REPORT_REPOSITORY = new InjectionToken<JourneyReportRepository>(
  'JOURNEY_REPORT_REPOSITORY',
);

export class SqliteJourneyReportRepository implements JourneyReportRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async listJourneys(): Promise<readonly ReportJourney[]> {
    const rows = await this.database.query(
      `SELECT id,fecha_negocio,estado,abierta_en_utc
         FROM jornadas_caja
        ORDER BY fecha_negocio DESC, abierta_en_utc DESC;`,
    );
    return rows.map(mapJourney);
  }

  async get(journeyId: string): Promise<JourneyReport | null> {
    const journeys = await this.database.query(
      `SELECT id,fecha_negocio,estado,abierta_en_utc,monto_inicial_centimos
         FROM jornadas_caja WHERE id=? LIMIT 1;`,
      [journeyId],
    );
    if (!journeys.length) return null;

    const [methodRows, movementRows, saleTypeRows, operationRows, correctionRows] =
      await Promise.all([
        this.database.query(
          `SELECT mp.codigo,mp.nombre,
                  COALESCE(SUM(CASE WHEN m.tipo IN ('INGRESO_COBRO','CORRECCION_ENTRADA') THEN m.monto_centimos ELSE 0 END),0) AS ingresos,
                  COALESCE(SUM(CASE WHEN m.tipo IN ('SALIDA_GASTO','CORRECCION_SALIDA') THEN m.monto_centimos ELSE 0 END),0) AS salidas
             FROM metodos_pago mp
             LEFT JOIN movimientos_caja m ON m.metodo_pago_id=mp.id AND m.jornada_id=?
            WHERE mp.activo=1 OR m.id IS NOT NULL
            GROUP BY mp.id,mp.codigo,mp.nombre,mp.orden
            ORDER BY mp.orden,mp.nombre;`,
          [journeyId],
        ),
        this.database.query(
          `SELECT m.id,mp.nombre AS metodo_nombre,m.tipo,m.monto_centimos,m.ocurrido_en_utc
             FROM movimientos_caja m JOIN metodos_pago mp ON mp.id=m.metodo_pago_id
            WHERE m.jornada_id=? ORDER BY m.ocurrido_en_utc,m.id;`,
          [journeyId],
        ),
        this.database.query(
          `SELECT tipo,COUNT(*) AS cantidad,COALESCE(SUM(total_centimos),0) AS total
             FROM operaciones
            WHERE jornada_venta_id=? AND estado='FINALIZADA'
            GROUP BY tipo ORDER BY tipo;`,
          [journeyId],
        ),
        this.database.query(
          `SELECT codigo,tipo,total_centimos,finalizada_en_utc
             FROM operaciones
            WHERE jornada_venta_id=? AND estado='FINALIZADA'
            ORDER BY finalizada_en_utc,codigo;`,
          [journeyId],
        ),
        this.database.query(
          `SELECT
             COALESCE(SUM(CASE WHEN impacto_venta='SUMA' THEN monto_venta_centimos ELSE 0 END),0) AS suma,
             COALESCE(SUM(CASE WHEN impacto_venta='RESTA' THEN monto_venta_centimos ELSE 0 END),0) AS resta
             FROM correcciones_economicas WHERE jornada_venta_impactada_id=?;`,
          [journeyId],
        ),
      ]);

    const cashMethods = methodRows.map(mapMethod);
    const initialCashCents = integer(journeys[0], 'monto_inicial_centimos');
    const cashNet = cashMethods.find((method) => method.code === 'EFECTIVO')?.netCents ?? 0;
    const salesByType = saleTypeRows.map(mapSaleType);
    const grossSalesCents = salesByType.reduce((sum, item) => sum + item.totalCents, 0);
    const salesCorrectionAddsCents = integer(correctionRows[0], 'suma');
    const salesCorrectionSubtractsCents = integer(correctionRows[0], 'resta');
    return {
      journey: mapJourney(journeys[0]),
      initialCashCents,
      expectedCashCents: initialCashCents + cashNet,
      cashMethods,
      cashMovements: movementRows.map(mapMovement),
      salesByType,
      salesOperations: operationRows.map(mapOperation),
      grossSalesCents,
      salesCorrectionAddsCents,
      salesCorrectionSubtractsCents,
      netSalesCents: grossSalesCents + salesCorrectionAddsCents - salesCorrectionSubtractsCents,
    };
  }
}

function mapJourney(row: QuickSaleRow): ReportJourney {
  return {
    id: text(row, 'id'),
    businessDate: text(row, 'fecha_negocio'),
    state: text(row, 'estado') as ReportJourney['state'],
    openedAtUtc: text(row, 'abierta_en_utc'),
  };
}

function mapMethod(row: QuickSaleRow): CashReportMethod {
  const inflowCents = integer(row, 'ingresos');
  const outflowCents = integer(row, 'salidas');
  return {
    code: text(row, 'codigo'),
    name: text(row, 'nombre'),
    inflowCents,
    outflowCents,
    netCents: inflowCents - outflowCents,
  };
}

function mapMovement(row: QuickSaleRow): CashReportMovement {
  return {
    id: text(row, 'id'),
    methodName: text(row, 'metodo_nombre'),
    type: text(row, 'tipo') as CashReportMovement['type'],
    amountCents: integer(row, 'monto_centimos'),
    occurredAtUtc: text(row, 'ocurrido_en_utc'),
  };
}

function mapSaleType(row: QuickSaleRow): SalesReportType {
  return {
    type: text(row, 'tipo') as SalesReportType['type'],
    operationCount: integer(row, 'cantidad'),
    totalCents: integer(row, 'total'),
  };
}

function mapOperation(row: QuickSaleRow): SalesReportOperation {
  return {
    code: text(row, 'codigo'),
    type: text(row, 'tipo') as SalesReportOperation['type'],
    totalCents: integer(row, 'total_centimos'),
    finalizedAtUtc: text(row, 'finalizada_en_utc'),
  };
}

function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value) throw new Error(`Campo ${key} inválido.`);
  return value;
}

function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if ((typeof value !== 'number' && typeof value !== 'bigint') || Number(value) < 0)
    throw new Error(`Campo ${key} inválido.`);
  return Number(value);
}
