import { InjectionToken } from '@angular/core';

import {
  QuickSaleCancellationIdempotencyConflictError,
  QuickSaleNotCancellableError,
  type CancelledQuickSale,
  type CancelQuickSaleCommand,
  type QuickSaleCancellationRepository,
} from '../../domain/sale/cancel-quick-sale.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from './sqlite-quick-sale.repository';

export const QUICK_SALE_CANCELLATION_REPOSITORY =
  new InjectionToken<QuickSaleCancellationRepository>('QUICK_SALE_CANCELLATION_REPOSITORY');

export class SqliteQuickSaleCancellationRepository implements QuickSaleCancellationRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async cancel(command: CancelQuickSaleCommand): Promise<CancelledQuickSale> {
    await this.database.beginTransaction();
    try {
      const previous = await this.database.query(
        `SELECT a.id,a.usuario_id,a.entidad_id,a.motivo,a.ocurrido_en_utc,o.codigo
           FROM auditoria a JOIN operaciones o ON o.id=a.entidad_id
          WHERE a.id=? AND a.accion='ANULAR_VENTA_RAPIDA' LIMIT 1;`,
        [command.auditId],
      );
      if (previous.length) {
        if (!same(previous[0], command)) {
          throw new QuickSaleCancellationIdempotencyConflictError();
        }
        const result = map(previous[0]);
        await this.database.commitTransaction();
        return result;
      }
      const operations = await this.database.query(
        `SELECT o.id,o.codigo,o.jornada_creacion_id
           FROM operaciones o JOIN jornadas_caja j ON j.id=o.jornada_creacion_id
          WHERE o.id=? AND o.tipo='VENTA_RAPIDA' AND o.estado='ABIERTA'
            AND o.pagado_centimos=0 AND j.estado='ABIERTA'
            AND NOT EXISTS (SELECT 1 FROM cobros c WHERE c.operacion_id=o.id)
          LIMIT 1;`,
        [command.operationId],
      );
      if (!operations.length) throw new QuickSaleNotCancellableError();
      const operation = operations[0];
      await this.database.run(
        `UPDATE operaciones SET estado='ANULADA',anulada_por_usuario_id=?,anulada_en_utc=?,
          motivo_anulacion=?,version=version+1 WHERE id=? AND estado='ABIERTA';`,
        [command.actorUserId, command.cancelledAtUtc, command.reason, command.operationId],
      );
      await this.database.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,
          valores_anteriores_json,valores_nuevos_json,motivo,ocurrido_en_utc)
         VALUES (?,?,?,'ANULAR_VENTA_RAPIDA','OPERACION',?,?,?,?,?);`,
        [
          command.auditId,
          command.actorUserId,
          text(operation, 'jornada_creacion_id'),
          command.operationId,
          JSON.stringify({ estado: 'ABIERTA' }),
          JSON.stringify({ estado: 'ANULADA' }),
          command.reason,
          command.cancelledAtUtc,
        ],
      );
      const result: CancelledQuickSale = {
        operationId: command.operationId,
        operationCode: text(operation, 'codigo'),
        reason: command.reason,
        cancelledByUserId: command.actorUserId,
        cancelledAtUtc: command.cancelledAtUtc,
      };
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
}

function same(row: QuickSaleRow, command: CancelQuickSaleCommand): boolean {
  return (
    row['entidad_id'] === command.operationId &&
    row['usuario_id'] === command.actorUserId &&
    row['motivo'] === command.reason
  );
}
function map(row: QuickSaleRow): CancelledQuickSale {
  return {
    operationId: text(row, 'entidad_id'),
    operationCode: text(row, 'codigo'),
    reason: text(row, 'motivo'),
    cancelledByUserId: text(row, 'usuario_id'),
    cancelledAtUtc: text(row, 'ocurrido_en_utc'),
  };
}
function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value) throw new Error(`Campo ${key} inválido.`);
  return value;
}
