import { InjectionToken } from '@angular/core';

import {
  JourneyCloseBlockedError,
  JourneyCloseDifferenceJustificationRequiredError,
  JourneyCloseIdempotencyConflictError,
  OpenJourneyToCloseRequiredError,
  type ClosedJourney,
  type CloseJourneyCommand,
  type ExceptionalCloseJourneyCommand,
  type JourneyClosingRepository,
  type PendingJourneyCorrection,
} from '../../domain/cash/close-journey.use-case';

export const JOURNEY_CLOSING_REPOSITORY = new InjectionToken<JourneyClosingRepository>(
  'JOURNEY_CLOSING_REPOSITORY',
);
export type JourneyCloseWriteValue = string | number | bigint | null | Uint8Array;
export type JourneyCloseWriteRow = Readonly<Record<string, JourneyCloseWriteValue>>;
export interface JourneyCloseWriteDatabase {
  query(
    statement: string,
    values?: readonly JourneyCloseWriteValue[],
  ): Promise<readonly JourneyCloseWriteRow[]>;
  run(statement: string, values?: readonly JourneyCloseWriteValue[]): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

export class SqliteJourneyClosingRepository implements JourneyClosingRepository {
  constructor(private readonly database: JourneyCloseWriteDatabase) {}

  async closeNormal(command: CloseJourneyCommand): Promise<ClosedJourney> {
    return this.close(command, 'NORMAL', command.currentBusinessDate);
  }

  async closeExceptional(command: ExceptionalCloseJourneyCommand): Promise<ClosedJourney> {
    return this.close(command, 'EXCEPCIONAL', command.currentBusinessDate);
  }

  async closeCorrected(command: CloseJourneyCommand): Promise<ClosedJourney> {
    return this.close(command, 'CORREGIDO');
  }

  async findPendingCorrection(): Promise<PendingJourneyCorrection | null> {
    const rows = await this.database.query(
      `SELECT j.id AS jornada_id, j.fecha_negocio, r.id AS reapertura_id,
              r.cierre_reabierto_id AS cierre_anterior_id, c.secuencia AS cierre_anterior_secuencia,
              r.motivo AS motivo_reapertura
         FROM jornadas_caja j
         JOIN reaperturas_jornada r ON r.jornada_id = j.id
         JOIN cierres_jornada c ON c.id = r.cierre_reabierto_id
         LEFT JOIN cierres_jornada cc ON cc.reapertura_id = r.id
        WHERE j.estado = 'ABIERTA' AND cc.id IS NULL
          AND c.secuencia = (SELECT MAX(c2.secuencia) FROM cierres_jornada c2 WHERE c2.jornada_id = j.id)
        ORDER BY r.reabierta_en_utc DESC LIMIT 1;`,
    );
    return rows.length === 0 ? null : mapPendingCorrection(rows[0]);
  }

  private async close(
    command: CloseJourneyCommand,
    closeType: 'NORMAL' | 'EXCEPCIONAL' | 'CORREGIDO',
    currentBusinessDate?: string,
  ): Promise<ClosedJourney> {
    await this.database.beginTransaction();
    try {
      const previous = await this.findByKey(command.idempotencyKey);
      if (previous.length > 0) {
        if (!sameRequest(previous[0], command, closeType))
          throw new JourneyCloseIdempotencyConflictError();
        const result = mapClosed(previous[0]);
        await this.database.commitTransaction();
        return result;
      }
      const journeys = await this.database.query(
        `SELECT id, fecha_negocio, monto_inicial_centimos FROM jornadas_caja WHERE estado = 'ABIERTA' LIMIT 1;`,
      );
      if (journeys.length === 0) throw new OpenJourneyToCloseRequiredError();
      const journeyId = stringValue(journeys[0], 'id');
      const businessDate = stringValue(journeys[0], 'fecha_negocio');
      const pendingCorrection = await this.findPendingCorrection();
      if (closeType === 'CORREGIDO' && pendingCorrection === null) {
        throw new JourneyCloseBlockedError(['CORRECTED_CLOSE_REQUIRES_REOPENING']);
      }
      if (closeType !== 'CORREGIDO' && pendingCorrection !== null) {
        throw new JourneyCloseBlockedError(['REOPENED_JOURNEY_REQUIRES_CORRECTED_CLOSE']);
      }
      if (closeType === 'EXCEPCIONAL' && !(businessDate < (currentBusinessDate ?? ''))) {
        throw new JourneyCloseBlockedError(['EXCEPTIONAL_CLOSE_REQUIRES_PREVIOUS_DAY']);
      }
      if (
        closeType === 'NORMAL' &&
        currentBusinessDate !== undefined &&
        businessDate !== currentBusinessDate
      ) {
        throw new JourneyCloseBlockedError(['NORMAL_CLOSE_REQUIRES_CURRENT_DAY']);
      }
      const expectedCashCents = await this.expectedCash(
        journeyId,
        numberValue(journeys[0], 'monto_inicial_centimos'),
      );
      if (expectedCashCents < 0) throw new JourneyCloseBlockedError(['NEGATIVE_EXPECTED_CASH']);
      const blockers = await this.operationalBlockers(journeyId);
      if (blockers.length > 0) throw new JourneyCloseBlockedError(blockers);
      const signedDifference = command.actualCashCents - expectedCashCents;
      const differenceCents = Math.abs(signedDifference);
      const differenceType =
        signedDifference === 0 ? 'CUADRA' : signedDifference > 0 ? 'SOBRANTE' : 'FALTANTE';
      if (differenceCents > 0 && command.justification === null) {
        throw new JourneyCloseDifferenceJustificationRequiredError();
      }
      if (closeType === 'CORREGIDO' && command.justification === null) {
        throw new JourneyCloseDifferenceJustificationRequiredError();
      }
      const previousCloseId = pendingCorrection?.previousCloseId ?? null;
      const reopeningId = pendingCorrection?.reopeningId ?? null;
      const sequence = pendingCorrection ? pendingCorrection.previousCloseSequence + 1 : 1;
      await this.database.run(
        `INSERT INTO cierres_jornada (
          id, jornada_id, cierre_anterior_id, reapertura_id, secuencia, tipo,
          realizado_por_usuario_id, cerrado_en_utc, efectivo_esperado_centimos,
          efectivo_real_centimos, tipo_diferencia, diferencia_centimos, justificacion,
          clave_idempotencia
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          command.closeId,
          journeyId,
          previousCloseId,
          reopeningId,
          sequence,
          closeType,
          command.actorUserId,
          command.closedAtUtc,
          expectedCashCents,
          command.actualCashCents,
          differenceType,
          differenceCents,
          command.justification,
          command.idempotencyKey,
        ],
      );
      await this.database.run(
        `UPDATE jornadas_caja SET estado = 'CERRADA', version = version + 1 WHERE id = ? AND estado = 'ABIERTA';`,
        [journeyId],
      );
      await this.database.run(
        `INSERT INTO auditoria (
          id, usuario_id, jornada_id, accion, entidad_tipo, entidad_id,
          valores_anteriores_json, valores_nuevos_json, motivo, ocurrido_en_utc
        ) VALUES (?, ?, ?, ?, 'CIERRE_JORNADA', ?, ?, ?, ?, ?);`,
        [
          command.auditId,
          command.actorUserId,
          journeyId,
          closeType === 'NORMAL'
            ? 'CERRAR_JORNADA'
            : closeType === 'EXCEPCIONAL'
              ? 'CERRAR_JORNADA_EXCEPCIONAL'
              : 'CERRAR_JORNADA_CORREGIDO',
          command.closeId,
          JSON.stringify({ estado_jornada: 'ABIERTA' }),
          JSON.stringify({
            estado_jornada: 'CERRADA',
            efectivo_esperado_centimos: expectedCashCents,
            efectivo_real_centimos: command.actualCashCents,
            tipo_diferencia: differenceType,
            diferencia_centimos: differenceCents,
            cierre_anterior_id: previousCloseId,
            reapertura_id: reopeningId,
            secuencia: sequence,
          }),
          command.justification,
          command.closedAtUtc,
        ],
      );
      const created = await this.findByKey(command.idempotencyKey);
      if (created.length !== 1) throw new Error('No se pudo verificar el cierre creado.');
      const result = mapClosed(created[0]);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private async expectedCash(journeyId: string, initial: number): Promise<number> {
    const rows = await this.database.query(
      `SELECT COALESCE(SUM(CASE
        WHEN m.tipo IN ('INGRESO_COBRO', 'CORRECCION_ENTRADA') THEN m.monto_centimos
        ELSE -m.monto_centimos END), 0) AS neto
       FROM movimientos_caja m JOIN metodos_pago mp ON mp.id = m.metodo_pago_id
       WHERE m.jornada_id = ? AND mp.codigo = 'EFECTIVO';`,
      [journeyId],
    );
    return initial + numberValue(rows[0], 'neto');
  }

  private async operationalBlockers(journeyId: string): Promise<string[]> {
    const rows = await this.database.query(
      `SELECT o.codigo, CASE WHEN o.tipo = 'CUENTA_MESA' AND EXISTS (
          SELECT 1 FROM operacion_mesas om WHERE om.operacion_id = o.id AND om.liberada_en_utc IS NULL
        ) THEN 'OPEN_TABLE' ELSE 'PENDING_ACCOUNT' END AS bloqueo
       FROM operaciones o
       WHERE o.jornada_creacion_id = ? AND o.estado NOT IN ('FINALIZADA', 'ANULADA')
         AND ((o.tipo = 'CUENTA_MESA' AND EXISTS (
           SELECT 1 FROM operacion_mesas om WHERE om.operacion_id = o.id AND om.liberada_en_utc IS NULL
         )) OR (o.tipo IN ('VENTA_RAPIDA', 'CUENTA_MESA') AND o.saldo_centimos > 0));`,
      [journeyId],
    );
    return rows.map((row) => `${stringValue(row, 'bloqueo')}:${stringValue(row, 'codigo')}`);
  }

  private findByKey(key: string): Promise<readonly JourneyCloseWriteRow[]> {
    return this.database.query(
      `SELECT c.id, c.jornada_id, j.fecha_negocio, c.tipo, c.efectivo_esperado_centimos,
        c.efectivo_real_centimos, c.tipo_diferencia, c.diferencia_centimos,
        c.justificacion, c.realizado_por_usuario_id, c.cerrado_en_utc, c.clave_idempotencia
       FROM cierres_jornada c JOIN jornadas_caja j ON j.id = c.jornada_id
       WHERE c.clave_idempotencia = ? LIMIT 1;`,
      [key],
    );
  }
}

function sameRequest(
  row: JourneyCloseWriteRow,
  command: CloseJourneyCommand,
  closeType: 'NORMAL' | 'EXCEPCIONAL' | 'CORREGIDO',
): boolean {
  return (
    row['tipo'] === closeType &&
    row['efectivo_real_centimos'] === command.actualCashCents &&
    row['justificacion'] === command.justification &&
    row['realizado_por_usuario_id'] === command.actorUserId
  );
}
function mapPendingCorrection(row: JourneyCloseWriteRow): PendingJourneyCorrection {
  return {
    journeyId: stringValue(row, 'jornada_id'),
    businessDate: stringValue(row, 'fecha_negocio'),
    reopeningId: stringValue(row, 'reapertura_id'),
    previousCloseId: stringValue(row, 'cierre_anterior_id'),
    previousCloseSequence: numberValue(row, 'cierre_anterior_secuencia'),
    reopeningReason: stringValue(row, 'motivo_reapertura'),
  };
}
function mapClosed(row: JourneyCloseWriteRow): ClosedJourney {
  return {
    closeId: stringValue(row, 'id'),
    journeyId: stringValue(row, 'jornada_id'),
    businessDate: stringValue(row, 'fecha_negocio'),
    expectedCashCents: numberValue(row, 'efectivo_esperado_centimos'),
    actualCashCents: numberValue(row, 'efectivo_real_centimos'),
    differenceType: stringValue(row, 'tipo_diferencia') as ClosedJourney['differenceType'],
    differenceCents: numberValue(row, 'diferencia_centimos'),
    justification: row['justificacion'] === null ? null : stringValue(row, 'justificacion'),
    closedByUserId: stringValue(row, 'realizado_por_usuario_id'),
    closedAtUtc: stringValue(row, 'cerrado_en_utc'),
  };
}
function stringValue(row: JourneyCloseWriteRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Campo ${key} inválido.`);
  return value;
}
function numberValue(row: JourneyCloseWriteRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error(`Campo ${key} inválido.`);
  return value;
}
