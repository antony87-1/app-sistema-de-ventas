import { InjectionToken } from '@angular/core';

import type { QuickSaleDatabase, QuickSaleRow } from '../sale/sqlite-quick-sale.repository';
import {
  InvalidEconomicCorrectionError,
  type CorrectableEconomicRecord,
  type CorrectionOriginalType,
  type EconomicCorrectionCommand,
  type EconomicCorrectionSummary,
  type EconomicCorrectionsRepository,
} from '../../domain/correction/manage-economic-corrections.use-case';

export const ECONOMIC_CORRECTIONS_REPOSITORY = new InjectionToken<EconomicCorrectionsRepository>(
  'ECONOMIC_CORRECTIONS_REPOSITORY',
);

const ORIGINAL_COLUMN: Readonly<Record<CorrectionOriginalType, string>> = {
  OPERACION: 'operacion_original_id',
  COBRO: 'cobro_original_id',
  GASTO: 'gasto_original_id',
  CIERRE_JORNADA: 'cierre_original_id',
  MOVIMIENTO_CAJA: 'movimiento_original_id',
  CORRECCION_ECONOMICA: 'correccion_original_id',
};

export class SqliteEconomicCorrectionsRepository implements EconomicCorrectionsRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async listCorrectable(): Promise<readonly CorrectableEconomicRecord[]> {
    const rows = await this.database.query(`
      SELECT id,'OPERACION' AS tipo,codigo AS etiqueta,total_centimos AS monto,creada_en_utc AS fecha,jornada_creacion_id AS jornada,jornada_venta_id AS jornada_venta FROM operaciones
      UNION ALL SELECT id,'COBRO','Cobro '||id,importe_centimos,confirmado_en_utc,jornada_id,NULL FROM cobros
      UNION ALL SELECT id,'GASTO',descripcion,monto_centimos,registrado_en_utc,jornada_id,NULL FROM gastos
      UNION ALL SELECT id,'CIERRE_JORNADA','Cierre '||tipo,efectivo_real_centimos,cerrado_en_utc,jornada_id,NULL FROM cierres_jornada
      UNION ALL SELECT id,'MOVIMIENTO_CAJA',tipo,monto_centimos,ocurrido_en_utc,jornada_id,NULL FROM movimientos_caja
      UNION ALL SELECT id,'CORRECCION_ECONOMICA','Corrección: '||motivo,MAX(monto_caja_centimos,monto_venta_centimos),creada_en_utc,jornada_id,jornada_venta_impactada_id FROM correcciones_economicas
      ORDER BY fecha DESC LIMIT 300;`);
    return rows.map((row) => ({
      id: text(row, 'id'),
      type: text(row, 'tipo') as CorrectionOriginalType,
      label: text(row, 'etiqueta'),
      amountCents: integer(row, 'monto'),
      occurredAtUtc: text(row, 'fecha'),
      journeyId: text(row, 'jornada'),
      saleJourneyId: nullable(row, 'jornada_venta'),
    }));
  }

  async listCorrections(): Promise<readonly EconomicCorrectionSummary[]> {
    const rows = await this.database.query(
      `SELECT c.*,u.nombre_mostrar,
              CASE WHEN operacion_original_id IS NOT NULL THEN 'OPERACION'
                   WHEN cobro_original_id IS NOT NULL THEN 'COBRO'
                   WHEN gasto_original_id IS NOT NULL THEN 'GASTO'
                   WHEN cierre_original_id IS NOT NULL THEN 'CIERRE_JORNADA'
                   WHEN movimiento_original_id IS NOT NULL THEN 'MOVIMIENTO_CAJA'
                   ELSE 'CORRECCION_ECONOMICA' END AS tipo_original,
              COALESCE(operacion_original_id,cobro_original_id,gasto_original_id,cierre_original_id,movimiento_original_id,correccion_original_id) AS id_original
         FROM correcciones_economicas c JOIN usuarios u ON u.id=c.creada_por_usuario_id
        ORDER BY c.creada_en_utc DESC,c.id DESC;`,
    );
    return rows.map(mapSummary);
  }

  async create(command: EconomicCorrectionCommand): Promise<EconomicCorrectionSummary> {
    await this.database.beginTransaction();
    try {
      const old = await this.database.query(
        `SELECT id FROM correcciones_economicas WHERE clave_idempotencia=? LIMIT 1;`,
        [command.idempotencyKey],
      );
      if (old.length) {
        const summary = await this.get(text(old[0], 'id'));
        await this.database.commitTransaction();
        return summary;
      }
      const journeys = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (!journeys.length) throw new InvalidEconomicCorrectionError();
      const journeyId = text(journeys[0], 'id');
      await this.assertOriginal(command.originalType, command.originalId);
      if (command.saleJourneyId) {
        const saleJourney = await this.database.query(`SELECT id FROM jornadas_caja WHERE id=?;`, [
          command.saleJourneyId,
        ]);
        if (!saleJourney.length) throw new InvalidEconomicCorrectionError();
      }
      if (command.paymentMethodId) {
        const method = await this.database.query(
          `SELECT id FROM metodos_pago WHERE id=? AND activo=1;`,
          [command.paymentMethodId],
        );
        if (!method.length) throw new InvalidEconomicCorrectionError();
      }
      const originals = Object.fromEntries(
        Object.values(ORIGINAL_COLUMN).map((column) => [column, null]),
      ) as Record<string, string | null>;
      originals[ORIGINAL_COLUMN[command.originalType]] = command.originalId;
      await this.database.run(
        `INSERT INTO correcciones_economicas
        (id,jornada_id,creada_por_usuario_id,operacion_original_id,cobro_original_id,gasto_original_id,cierre_original_id,movimiento_original_id,correccion_original_id,motivo,impacto_caja,monto_caja_centimos,impacto_venta,monto_venta_centimos,jornada_venta_impactada_id,creada_en_utc,clave_idempotencia)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
        [
          command.correctionId,
          journeyId,
          command.actorUserId,
          originals['operacion_original_id'],
          originals['cobro_original_id'],
          originals['gasto_original_id'],
          originals['cierre_original_id'],
          originals['movimiento_original_id'],
          originals['correccion_original_id'],
          command.reason,
          command.cashImpact,
          command.cashAmountCents,
          command.saleImpact,
          command.saleAmountCents,
          command.saleJourneyId,
          command.occurredAtUtc,
          command.idempotencyKey,
        ],
      );
      if (command.cashImpact !== 'SIN_EFECTO') {
        await this.database.run(
          `INSERT INTO movimientos_caja (id,jornada_id,metodo_pago_id,registrado_por_usuario_id,tipo,monto_centimos,correccion_id,ocurrido_en_utc) VALUES (?,?,?,?,?,?,?,?);`,
          [
            command.movementId,
            journeyId,
            command.paymentMethodId,
            command.actorUserId,
            command.cashImpact === 'SUMA' ? 'CORRECCION_ENTRADA' : 'CORRECCION_SALIDA',
            command.cashAmountCents,
            command.correctionId,
            command.occurredAtUtc,
          ],
        );
      }
      await this.database.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,valores_anteriores_json,valores_nuevos_json,motivo,ocurrido_en_utc) VALUES (?,?,?,'CREAR_CORRECCION_ECONOMICA','CORRECCION_ECONOMICA',?,?,?,?,?);`,
        [
          command.auditId,
          command.actorUserId,
          journeyId,
          command.correctionId,
          JSON.stringify({ tipo: command.originalType, id: command.originalId }),
          JSON.stringify({
            impacto_caja: command.cashImpact,
            monto_caja_centimos: command.cashAmountCents,
            impacto_venta: command.saleImpact,
            monto_venta_centimos: command.saleAmountCents,
            jornada_venta_id: command.saleJourneyId,
          }),
          command.reason,
          command.occurredAtUtc,
        ],
      );
      const result = await this.get(command.correctionId);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private async assertOriginal(type: CorrectionOriginalType, id: string): Promise<void> {
    const table = (
      {
        OPERACION: 'operaciones',
        COBRO: 'cobros',
        GASTO: 'gastos',
        CIERRE_JORNADA: 'cierres_jornada',
        MOVIMIENTO_CAJA: 'movimientos_caja',
        CORRECCION_ECONOMICA: 'correcciones_economicas',
      } as const
    )[type];
    if (!(await this.database.query(`SELECT id FROM ${table} WHERE id=? LIMIT 1;`, [id])).length)
      throw new InvalidEconomicCorrectionError();
  }

  private async get(id: string): Promise<EconomicCorrectionSummary> {
    const rows = await this.database.query(
      `SELECT c.*,u.nombre_mostrar,CASE WHEN operacion_original_id IS NOT NULL THEN 'OPERACION' WHEN cobro_original_id IS NOT NULL THEN 'COBRO' WHEN gasto_original_id IS NOT NULL THEN 'GASTO' WHEN cierre_original_id IS NOT NULL THEN 'CIERRE_JORNADA' WHEN movimiento_original_id IS NOT NULL THEN 'MOVIMIENTO_CAJA' ELSE 'CORRECCION_ECONOMICA' END AS tipo_original,COALESCE(operacion_original_id,cobro_original_id,gasto_original_id,cierre_original_id,movimiento_original_id,correccion_original_id) AS id_original FROM correcciones_economicas c JOIN usuarios u ON u.id=c.creada_por_usuario_id WHERE c.id=? LIMIT 1;`,
      [id],
    );
    if (!rows.length) throw new InvalidEconomicCorrectionError();
    return mapSummary(rows[0]);
  }
}

function mapSummary(row: QuickSaleRow): EconomicCorrectionSummary {
  return {
    id: text(row, 'id'),
    originalId: text(row, 'id_original'),
    originalType: text(row, 'tipo_original') as CorrectionOriginalType,
    reason: text(row, 'motivo'),
    cashImpact: text(row, 'impacto_caja') as EconomicCorrectionSummary['cashImpact'],
    cashAmountCents: integer(row, 'monto_caja_centimos'),
    saleImpact: text(row, 'impacto_venta') as EconomicCorrectionSummary['saleImpact'],
    saleAmountCents: integer(row, 'monto_venta_centimos'),
    saleJourneyId: nullable(row, 'jornada_venta_impactada_id'),
    createdBy: text(row, 'nombre_mostrar'),
    createdAtUtc: text(row, 'creada_en_utc'),
  };
}
function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value) throw new Error(`Campo ${key} inválido.`);
  return value;
}
function nullable(row: QuickSaleRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`Campo ${key} inválido.`);
  return value;
}
function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if ((typeof value !== 'number' && typeof value !== 'bigint') || Number(value) < 0)
    throw new Error(`Campo ${key} inválido.`);
  return Number(value);
}
