import { InjectionToken } from '@angular/core';

import {
  InvalidTablePaymentError,
  TableAccountNotPayableError,
  TableAttentionNotFinalizableError,
  TablePaymentIdempotencyConflictError,
  type FinalizedTableAttention,
  type FinalizeTableAttentionCommand,
  type PayTableAccountCommand,
  type TableAccountPaymentRepository,
  type TableAccountPaymentResult,
} from '../../domain/table/pay-and-finalize-table-account.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from '../sale/sqlite-quick-sale.repository';

export const TABLE_ACCOUNT_PAYMENT_REPOSITORY = new InjectionToken<TableAccountPaymentRepository>(
  'TABLE_ACCOUNT_PAYMENT_REPOSITORY',
);

export class SqliteTableAccountPaymentRepository implements TableAccountPaymentRepository {
  constructor(private readonly database: QuickSaleDatabase) {}
  async pay(command: PayTableAccountCommand): Promise<TableAccountPaymentResult> {
    await this.database.beginTransaction();
    try {
      const previous = await this.findPayment(command.idempotencyKey);
      if (previous.length) {
        if (!(await this.samePayment(previous[0], command)))
          throw new TablePaymentIdempotencyConflictError();
        const result = await this.mapPayment(previous[0]);
        await this.database.commitTransaction();
        return result;
      }
      const journeys = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (!journeys.length) throw new TableAccountNotPayableError();
      const operations = await this.database.query(
        `SELECT id,codigo,estado,pagado_centimos,saldo_centimos FROM operaciones WHERE id=? AND tipo='CUENTA_MESA' AND estado IN ('ABIERTA','PAGADA_PARCIALMENTE','PAGADA') LIMIT 1;`,
        [command.operationId],
      );
      if (!operations.length) throw new TableAccountNotPayableError();
      const operation = operations[0];
      const allocations: Array<{ detailId: string; quantity: number; amount: number }> = [];
      for (const selection of command.selections) {
        const rows = await this.database.query(
          `SELECT cantidad_total,cantidad_pagada,precio_aplicado_unitario_centimos FROM operacion_detalles WHERE id=? AND operacion_id=? LIMIT 1;`,
          [selection.detailId, command.operationId],
        );
        if (
          !rows.length ||
          selection.quantity >
            integer(rows[0], 'cantidad_total') - integer(rows[0], 'cantidad_pagada')
        )
          throw new InvalidTablePaymentError();
        allocations.push({
          detailId: selection.detailId,
          quantity: selection.quantity,
          amount: selection.quantity * integer(rows[0], 'precio_aplicado_unitario_centimos'),
        });
      }
      const amount = allocations.reduce((sum, item) => sum + item.amount, 0);
      if (
        amount <= 0 ||
        amount > integer(operation, 'saldo_centimos') ||
        command.payments.reduce((sum, item) => sum + item.appliedCents, 0) !== amount
      )
        throw new InvalidTablePaymentError();
      const prepared: Array<{
        item: PayTableAccountCommand['payments'][number];
        methodId: string;
        change: number;
      }> = [];
      for (const item of command.payments) {
        const methods = await this.database.query(
          `SELECT id,permite_vuelto FROM metodos_pago WHERE codigo=? AND activo=1 LIMIT 1;`,
          [item.methodCode],
        );
        if (
          !methods.length ||
          item.receivedCents < item.appliedCents ||
          (integer(methods[0], 'permite_vuelto') !== 1 && item.receivedCents !== item.appliedCents)
        )
          throw new InvalidTablePaymentError();
        prepared.push({
          item,
          methodId: text(methods[0], 'id'),
          change: item.receivedCents - item.appliedCents,
        });
      }
      const balance = integer(operation, 'saldo_centimos') - amount;
      const state = balance === 0 ? 'PAGADA' : 'PAGADA_PARCIALMENTE';
      const journeyId = text(journeys[0], 'id');
      await this.database.run(
        `INSERT INTO cobros (id,operacion_id,jornada_id,confirmado_por_usuario_id,tipo,importe_centimos,saldo_resultante_centimos,confirmado_en_utc,clave_idempotencia) VALUES (?,?,?,?,'PAGO_DETALLES',?,?,?,?);`,
        [
          command.paymentId,
          command.operationId,
          journeyId,
          command.actorUserId,
          amount,
          balance,
          command.confirmedAtUtc,
          command.idempotencyKey,
        ],
      );
      for (const allocation of allocations) {
        await this.database.run(
          `INSERT INTO cobro_detalles (cobro_id,detalle_id,cantidad_pagada,importe_asignado_centimos) VALUES (?,?,?,?);`,
          [command.paymentId, allocation.detailId, allocation.quantity, allocation.amount],
        );
        await this.database.run(
          `UPDATE operacion_detalles SET cantidad_pagada=cantidad_pagada+? WHERE id=?;`,
          [allocation.quantity, allocation.detailId],
        );
      }
      for (const payment of prepared) {
        await this.database.run(
          `INSERT INTO cobro_metodos (id,cobro_id,metodo_pago_id,monto_aplicado_centimos,monto_recibido_centimos,vuelto_centimos) VALUES (?,?,?,?,?,?);`,
          [
            payment.item.entryId,
            command.paymentId,
            payment.methodId,
            payment.item.appliedCents,
            payment.item.receivedCents,
            payment.change,
          ],
        );
        await this.database.run(
          `INSERT INTO movimientos_caja (id,jornada_id,metodo_pago_id,registrado_por_usuario_id,tipo,monto_centimos,cobro_metodo_id,ocurrido_en_utc) VALUES (?,?,?,?,'INGRESO_COBRO',?,?,?);`,
          [
            payment.item.movementId,
            journeyId,
            payment.methodId,
            command.actorUserId,
            payment.item.appliedCents,
            payment.item.entryId,
            command.confirmedAtUtc,
          ],
        );
      }
      await this.database.run(
        `UPDATE operaciones SET pagado_centimos=pagado_centimos+?,saldo_centimos=?,estado=?,version=version+1 WHERE id=?;`,
        [amount, balance, state, command.operationId],
      );
      await this.database.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,valores_anteriores_json,valores_nuevos_json,ocurrido_en_utc) VALUES (?,?,?,'COBRAR_PRODUCTOS_CUENTA','OPERACION',?,?,?,?);`,
        [
          command.auditId,
          command.actorUserId,
          journeyId,
          command.operationId,
          JSON.stringify({ saldo_centimos: integer(operation, 'saldo_centimos') }),
          JSON.stringify({
            cobro_id: command.paymentId,
            selecciones: command.selections,
            saldo_centimos: balance,
          }),
          command.confirmedAtUtc,
        ],
      );
      const created = (await this.findPayment(command.idempotencyKey))[0];
      const result = await this.mapPayment(created);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
  async finalize(command: FinalizeTableAttentionCommand): Promise<FinalizedTableAttention> {
    await this.database.beginTransaction();
    try {
      const previous = await this.database.query(
        `SELECT a.entidad_id,a.usuario_id,a.ocurrido_en_utc,a.valores_nuevos_json,o.codigo FROM auditoria a JOIN operaciones o ON o.id=a.entidad_id WHERE a.id=? AND a.accion='FINALIZAR_ATENCION_CUENTA' LIMIT 1;`,
        [command.idempotencyKey],
      );
      if (previous.length) {
        if (
          previous[0]['entidad_id'] !== command.operationId ||
          previous[0]['usuario_id'] !== command.actorUserId
        )
          throw new TablePaymentIdempotencyConflictError();
        const result = mapFinal(previous[0]);
        await this.database.commitTransaction();
        return result;
      }
      const journeys = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (!journeys.length) throw new TableAttentionNotFinalizableError();
      const operations = await this.database.query(
        `SELECT id,codigo FROM operaciones o WHERE id=? AND tipo='CUENTA_MESA' AND estado='PAGADA' AND saldo_centimos=0 AND EXISTS(SELECT 1 FROM operacion_detalles d WHERE d.operacion_id=o.id) AND NOT EXISTS(SELECT 1 FROM operacion_detalles d WHERE d.operacion_id=o.id AND d.cantidad_pagada<>d.cantidad_total) LIMIT 1;`,
        [command.operationId],
      );
      if (!operations.length) throw new TableAttentionNotFinalizableError();
      const tables = await this.database.query(
        `SELECT mesa_id FROM operacion_mesas WHERE operacion_id=? AND liberada_en_utc IS NULL ORDER BY rol_mesa,mesa_id;`,
        [command.operationId],
      );
      const tableIds = tables.map((row) => text(row, 'mesa_id'));
      const journeyId = text(journeys[0], 'id');
      await this.database.run(
        `UPDATE operacion_mesas SET liberada_por_usuario_id=?,liberada_en_utc=? WHERE operacion_id=? AND liberada_en_utc IS NULL;`,
        [command.actorUserId, command.finalizedAtUtc, command.operationId],
      );
      await this.database.run(
        `UPDATE operaciones SET estado='FINALIZADA',jornada_venta_id=?,finalizada_por_usuario_id=?,finalizada_en_utc=?,version=version+1 WHERE id=?;`,
        [journeyId, command.actorUserId, command.finalizedAtUtc, command.operationId],
      );
      await this.database.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,valores_anteriores_json,valores_nuevos_json,ocurrido_en_utc) VALUES (?,?,?,'FINALIZAR_ATENCION_CUENTA','OPERACION',?,?,?,?);`,
        [
          command.idempotencyKey,
          command.actorUserId,
          journeyId,
          command.operationId,
          JSON.stringify({ estado: 'PAGADA' }),
          JSON.stringify({ estado: 'FINALIZADA', mesas_liberadas: tableIds }),
          command.finalizedAtUtc,
        ],
      );
      await this.database.commitTransaction();
      return {
        operationId: command.operationId,
        operationCode: text(operations[0], 'codigo'),
        finalizedAtUtc: command.finalizedAtUtc,
        releasedTableIds: tableIds,
      };
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
  private findPayment(key: string): Promise<readonly QuickSaleRow[]> {
    return this.database.query(
      `SELECT c.id,c.operacion_id,c.importe_centimos,c.saldo_resultante_centimos,c.confirmado_por_usuario_id,c.confirmado_en_utc,o.codigo,o.estado FROM cobros c JOIN operaciones o ON o.id=c.operacion_id WHERE c.clave_idempotencia=? LIMIT 1;`,
      [key],
    );
  }
  private async samePayment(row: QuickSaleRow, command: PayTableAccountCommand): Promise<boolean> {
    const allocations = await this.database.query(
      `SELECT detalle_id,cantidad_pagada FROM cobro_detalles WHERE cobro_id=? ORDER BY detalle_id;`,
      [text(row, 'id')],
    );
    const methods = await this.database.query(
      `SELECT mp.codigo,cm.monto_aplicado_centimos,cm.monto_recibido_centimos FROM cobro_metodos cm JOIN metodos_pago mp ON mp.id=cm.metodo_pago_id WHERE cm.cobro_id=? ORDER BY mp.codigo;`,
      [text(row, 'id')],
    );
    return (
      row['operacion_id'] === command.operationId &&
      row['confirmado_por_usuario_id'] === command.actorUserId &&
      signatureSelections(allocations) === signatureSelections(command.selections) &&
      signatureMethods(methods) === signatureMethods(command.payments)
    );
  }
  private async mapPayment(row: QuickSaleRow): Promise<TableAccountPaymentResult> {
    const methods = await this.database.query(
      `SELECT vuelto_centimos FROM cobro_metodos WHERE cobro_id=?;`,
      [text(row, 'id')],
    );
    return {
      operationId: text(row, 'operacion_id'),
      operationCode: text(row, 'codigo'),
      paymentId: text(row, 'id'),
      amountCents: integer(row, 'importe_centimos'),
      balanceCents: integer(row, 'saldo_resultante_centimos'),
      state: integer(row, 'saldo_resultante_centimos') === 0 ? 'PAGADA' : 'PAGADA_PARCIALMENTE',
      changeCents: methods.reduce((sum, item) => sum + integer(item, 'vuelto_centimos'), 0),
      confirmedAtUtc: text(row, 'confirmado_en_utc'),
    };
  }
}
function signatureSelections(
  rows: readonly (QuickSaleRow | { detailId: string; quantity: number })[],
): string {
  return rows
    .map((row) =>
      'detailId' in row
        ? `${row.detailId}:${row.quantity}`
        : `${String(row['detalle_id'])}:${String(row['cantidad_pagada'])}`,
    )
    .sort()
    .join('|');
}
function signatureMethods(
  rows: readonly (
    | QuickSaleRow
    | { methodCode: string; appliedCents: number; receivedCents: number }
  )[],
): string {
  return rows
    .map((row) =>
      'methodCode' in row
        ? `${row.methodCode}:${row.appliedCents}:${row.receivedCents}`
        : `${String(row['codigo'])}:${String(row['monto_aplicado_centimos'])}:${String(row['monto_recibido_centimos'])}`,
    )
    .sort()
    .join('|');
}
function mapFinal(row: QuickSaleRow): FinalizedTableAttention {
  const values = JSON.parse(text(row, 'valores_nuevos_json')) as { mesas_liberadas: string[] };
  return {
    operationId: text(row, 'entidad_id'),
    operationCode: text(row, 'codigo'),
    finalizedAtUtc: text(row, 'ocurrido_en_utc'),
    releasedTableIds: values.mesas_liberadas,
  };
}
function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value) throw new Error(`Campo ${key} inválido.`);
  return value;
}
function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' && !(typeof value === 'bigint'))
    throw new Error(`Campo ${key} inválido.`);
  return Number(value);
}
