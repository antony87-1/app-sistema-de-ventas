import { InjectionToken } from '@angular/core';

import {
  InvalidQuickSalePaymentError,
  QuickSaleNotPayableError,
  QuickSalePaymentIdempotencyConflictError,
  type FinalizedQuickSale,
  type FinalizeQuickSaleCommand,
  type QuickSaleFinalizationRepository,
  type QuickSalePaymentInput,
  type QuickSalePaymentMethodCode,
} from '../../domain/sale/finalize-quick-sale.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from './sqlite-quick-sale.repository';

export const QUICK_SALE_FINALIZATION_REPOSITORY =
  new InjectionToken<QuickSaleFinalizationRepository>('QUICK_SALE_FINALIZATION_REPOSITORY');

export class SqliteQuickSaleFinalizationRepository implements QuickSaleFinalizationRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async finalize(command: FinalizeQuickSaleCommand): Promise<FinalizedQuickSale> {
    await this.database.beginTransaction();
    try {
      const old = await this.findByKey(command.idempotencyKey);
      if (old.length) {
        const payments = await this.paymentRows(text(old[0], 'cobro_id'));
        if (!sameRequest(old[0], payments, command)) {
          throw new QuickSalePaymentIdempotencyConflictError();
        }
        const result = mapResult(old[0], payments);
        await this.database.commitTransaction();
        return result;
      }
      const operations = await this.database.query(
        `SELECT o.id,o.codigo,o.total_centimos,o.saldo_centimos,j.id AS jornada_id
           FROM operaciones o JOIN jornadas_caja j ON j.estado='ABIERTA'
          WHERE o.id=? AND o.tipo='VENTA_RAPIDA' AND o.estado='ABIERTA'
            AND o.jornada_creacion_id=j.id LIMIT 1;`,
        [command.operationId],
      );
      if (!operations.length) throw new QuickSaleNotPayableError();
      const operation = operations[0];
      const total = integer(operation, 'total_centimos');
      if (
        total <= 0 ||
        integer(operation, 'saldo_centimos') !== total ||
        command.payments.reduce((sum, payment) => sum + payment.appliedCents, 0) !== total
      ) {
        throw new InvalidQuickSalePaymentError();
      }
      const prepared = [] as Array<{
        command: FinalizeQuickSaleCommand['payments'][number];
        methodId: string;
        changeCents: number;
      }>;
      for (const payment of command.payments) {
        const methods = await this.database.query(
          `SELECT id,permite_vuelto FROM metodos_pago WHERE codigo=? AND activo=1 LIMIT 1;`,
          [payment.methodCode],
        );
        if (!methods.length) throw new InvalidQuickSalePaymentError();
        const allowsChange = integer(methods[0], 'permite_vuelto') === 1;
        if (
          payment.receivedCents < payment.appliedCents ||
          (!allowsChange && payment.receivedCents !== payment.appliedCents)
        ) {
          throw new InvalidQuickSalePaymentError();
        }
        prepared.push({
          command: payment,
          methodId: text(methods[0], 'id'),
          changeCents: payment.receivedCents - payment.appliedCents,
        });
      }
      const journeyId = text(operation, 'jornada_id');
      await this.database.run(
        `INSERT INTO cobros (id,operacion_id,jornada_id,confirmado_por_usuario_id,tipo,
          importe_centimos,saldo_resultante_centimos,confirmado_en_utc,clave_idempotencia)
         VALUES (?,?,?,?,'PAGO_DETALLES',?,0,?,?);`,
        [
          command.paymentId,
          command.operationId,
          journeyId,
          command.actorUserId,
          total,
          command.confirmedAtUtc,
          command.idempotencyKey,
        ],
      );
      await this.database.run(
        `INSERT INTO cobro_detalles (cobro_id,detalle_id,cantidad_pagada,importe_asignado_centimos)
         SELECT ?,id,cantidad_total,subtotal_centimos FROM operacion_detalles WHERE operacion_id=?;`,
        [command.paymentId, command.operationId],
      );
      for (const payment of prepared) {
        await this.database.run(
          `INSERT INTO cobro_metodos (id,cobro_id,metodo_pago_id,monto_aplicado_centimos,monto_recibido_centimos,vuelto_centimos)
           VALUES (?,?,?,?,?,?);`,
          [
            payment.command.paymentMethodEntryId,
            command.paymentId,
            payment.methodId,
            payment.command.appliedCents,
            payment.command.receivedCents,
            payment.changeCents,
          ],
        );
        await this.database.run(
          `INSERT INTO movimientos_caja (id,jornada_id,metodo_pago_id,registrado_por_usuario_id,tipo,monto_centimos,cobro_metodo_id,ocurrido_en_utc)
           VALUES (?,?,?,?,'INGRESO_COBRO',?,?,?);`,
          [
            payment.command.movementId,
            journeyId,
            payment.methodId,
            command.actorUserId,
            payment.command.appliedCents,
            payment.command.paymentMethodEntryId,
            command.confirmedAtUtc,
          ],
        );
      }
      await this.database.run(
        `UPDATE operacion_detalles SET cantidad_pagada=cantidad_total WHERE operacion_id=?;`,
        [command.operationId],
      );
      await this.database.run(
        `UPDATE operaciones SET estado='FINALIZADA',jornada_venta_id=?,finalizada_por_usuario_id=?,
          finalizada_en_utc=?,pagado_centimos=total_centimos,saldo_centimos=0,version=version+1
         WHERE id=? AND estado='ABIERTA';`,
        [journeyId, command.actorUserId, command.confirmedAtUtc, command.operationId],
      );
      await this.database.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,valores_anteriores_json,valores_nuevos_json,ocurrido_en_utc)
         VALUES (?,?,?,'COBRAR_Y_FINALIZAR_VENTA_RAPIDA','OPERACION',?,?,?,?);`,
        [
          command.auditId,
          command.actorUserId,
          journeyId,
          command.operationId,
          JSON.stringify({ estado: 'ABIERTA', saldo_centimos: total }),
          JSON.stringify({ estado: 'FINALIZADA', saldo_centimos: 0, cobro_id: command.paymentId }),
          command.confirmedAtUtc,
        ],
      );
      const created = (await this.findByKey(command.idempotencyKey))[0];
      const result = mapResult(created, await this.paymentRows(command.paymentId));
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private findByKey(key: string): Promise<readonly QuickSaleRow[]> {
    return this.database.query(
      `SELECT c.id AS cobro_id,c.operacion_id,o.codigo,c.importe_centimos,
              c.confirmado_por_usuario_id,c.confirmado_en_utc
         FROM cobros c JOIN operaciones o ON o.id=c.operacion_id
        WHERE c.clave_idempotencia=? LIMIT 1;`,
      [key],
    );
  }

  private paymentRows(paymentId: string): Promise<readonly QuickSaleRow[]> {
    return this.database.query(
      `SELECT mp.codigo AS metodo_codigo,cm.monto_aplicado_centimos,
              cm.monto_recibido_centimos,cm.vuelto_centimos
         FROM cobro_metodos cm JOIN metodos_pago mp ON mp.id=cm.metodo_pago_id
        WHERE cm.cobro_id=? ORDER BY mp.codigo;`,
      [paymentId],
    );
  }
}

function sameRequest(
  row: QuickSaleRow,
  rows: readonly QuickSaleRow[],
  command: FinalizeQuickSaleCommand,
): boolean {
  return (
    row['operacion_id'] === command.operationId &&
    row['confirmado_por_usuario_id'] === command.actorUserId &&
    paymentSignature(rows.map(mapPayment)) === paymentSignature(command.payments)
  );
}
function mapResult(row: QuickSaleRow, rows: readonly QuickSaleRow[]): FinalizedQuickSale {
  const payments = rows.map(mapPayment);
  return {
    operationId: text(row, 'operacion_id'),
    operationCode: text(row, 'codigo'),
    paymentId: text(row, 'cobro_id'),
    totalCents: integer(row, 'importe_centimos'),
    receivedCents: payments.reduce((sum, payment) => sum + payment.receivedCents, 0),
    changeCents: rows.reduce((sum, payment) => sum + integer(payment, 'vuelto_centimos'), 0),
    payments,
    finalizedAtUtc: text(row, 'confirmado_en_utc'),
  };
}
function mapPayment(row: QuickSaleRow): QuickSalePaymentInput {
  return {
    methodCode: text(row, 'metodo_codigo') as QuickSalePaymentMethodCode,
    appliedCents: integer(row, 'monto_aplicado_centimos'),
    receivedCents: integer(row, 'monto_recibido_centimos'),
  };
}
function paymentSignature(payments: readonly QuickSalePaymentInput[]): string {
  return payments
    .map((payment) => `${payment.methodCode}:${payment.appliedCents}:${payment.receivedCents}`)
    .sort()
    .join('|');
}
function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value) throw new Error(`Campo ${key} inválido.`);
  return value;
}
function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Campo ${key} inválido.`);
  }
  return value;
}
