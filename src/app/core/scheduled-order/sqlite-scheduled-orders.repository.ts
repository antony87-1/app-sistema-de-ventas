import { InjectionToken } from '@angular/core';
import {
  InvalidScheduledOrderError,
  ScheduledAdvanceInvalidError,
  ScheduledOrderLockedError,
  type PreparationState,
  type ScheduledAdvanceCommand,
  type ScheduledOrderCommand,
  type ScheduledOrderSummary,
  type ScheduledOrdersRepository,
  type ScheduledTransitionCommand,
} from '../../domain/scheduled-order/manage-scheduled-orders.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from '../sale/sqlite-quick-sale.repository';
import { CUSTOM_SCHEDULED_PRODUCT_ID } from '../database/migrations/migration-v7';

export const SCHEDULED_ORDERS_REPOSITORY = new InjectionToken<ScheduledOrdersRepository>(
  'SCHEDULED_ORDERS_REPOSITORY',
);
export class SqliteScheduledOrdersRepository implements ScheduledOrdersRepository {
  constructor(private readonly database: QuickSaleDatabase) {}
  async create(command: ScheduledOrderCommand): Promise<ScheduledOrderSummary> {
    await this.database.beginTransaction();
    try {
      const old = await this.database.query(
        `SELECT id FROM operaciones WHERE clave_idempotencia=? LIMIT 1;`,
        [command.input.idempotencyKey],
      );
      if (old.length) {
        const result = await this.get(text(old[0], 'id'));
        await this.database.commitTransaction();
        return result;
      }
      const journeys = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (!journeys.length) throw new ScheduledOrderLockedError();
      const journeyId = text(journeys[0], 'id');
      const prepared: Prepared[] = [];
      for (let index = 0; index < command.input.lines.length; index++) {
        const line = command.input.lines[index];
        if ('customDescription' in line) {
          prepared.push({
            id: command.detailIds[index].principalId,
            parent: null,
            productId: CUSTOM_SCHEDULED_PRODUCT_ID,
            quantity: line.quantity,
            name: line.customDescription.trim(),
            category: 'Pedido personalizado',
            priceCents: line.unitPriceCents,
            allowsAddons: false,
            note: line.presentation.trim(),
          });
          continue;
        }
        const principal = await this.product(line.productId, false);
        prepared.push({
          id: command.detailIds[index].principalId,
          parent: null,
          productId: line.productId,
          quantity: line.quantity,
          note: null,
          ...principal,
        });
        if ((line.addons ?? []).length && !principal.allowsAddons)
          throw new InvalidScheduledOrderError();
        for (let child = 0; child < (line.addons ?? []).length; child++) {
          const addon = (line.addons ?? [])[child],
            product = await this.product(addon.productId, true);
          prepared.push({
            id: command.detailIds[index].addonIds[child],
            parent: command.detailIds[index].principalId,
            productId: addon.productId,
            quantity: addon.quantity,
            note: null,
            ...product,
          });
        }
      }
      const total = prepared.reduce((sum, item) => sum + item.quantity * item.priceCents, 0);
      await this.database.run(
        `INSERT INTO operaciones (id,codigo,tipo,estado,jornada_creacion_id,creada_por_usuario_id,creada_en_utc,subtotal_catalogo_centimos,descuento_total_centimos,total_centimos,pagado_centimos,saldo_centimos,nota,clave_idempotencia,version) VALUES (?,?,'PEDIDO_PROGRAMADO','ABIERTA',?,?,?, ?,0,?,0,?,NULL,?,1);`,
        [
          command.operationId,
          command.operationCode,
          journeyId,
          command.actorUserId,
          command.occurredAtUtc,
          total,
          total,
          total,
          command.input.idempotencyKey,
        ],
      );
      await this.database.run(
        `INSERT INTO pedido_programado_datos (operacion_id,cliente_nombre_snapshot,cliente_telefono_snapshot,entrega_programada_local,zona_horaria,tipo_entrega,direccion_snapshot,referencia_snapshot,estado_preparacion,estado_pago) VALUES (?,?,?,?,'America/Lima',?,?,?,'REGISTRADO','SIN_ADELANTO');`,
        [
          command.operationId,
          command.input.customerName,
          command.input.customerPhone,
          command.input.scheduledLocal,
          command.input.deliveryType,
          command.input.address ?? null,
          command.input.reference ?? null,
        ],
      );
      for (const item of prepared)
        await this.database.run(
          `INSERT INTO operacion_detalles (id,operacion_id,producto_id,detalle_principal_id,producto_nombre_snapshot,categoria_nombre_snapshot,cantidad_total,cantidad_servida,cantidad_pagada,precio_catalogo_unitario_centimos,precio_aplicado_unitario_centimos,tipo_ajuste_precio,motivo_ajuste_precio,ajustado_por_usuario_id,subtotal_centimos,estado_servicio,nota,agregado_por_usuario_id,agregado_en_utc) VALUES (?,?,?,?,?,?,?,0,0,?,?,'NINGUNO',NULL,NULL,?,'PENDIENTE',?,?,?);`,
          [
            item.id,
            command.operationId,
            item.productId,
            item.parent,
            item.name,
            item.category,
            item.quantity,
            item.priceCents,
            item.priceCents,
            item.quantity * item.priceCents,
            item.note,
            command.actorUserId,
            command.occurredAtUtc,
          ],
        );
      await this.audit(
        command.auditId,
        command.actorUserId,
        journeyId,
        'CREAR_PEDIDO_PROGRAMADO',
        command.operationId,
        { estado_preparacion: 'REGISTRADO', estado_pago: 'SIN_ADELANTO', total_centimos: total },
        command.occurredAtUtc,
      );
      const result = await this.get(command.operationId);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
  async list(): Promise<readonly ScheduledOrderSummary[]> {
    const rows = await this.database.query(
      `SELECT o.id FROM operaciones o JOIN pedido_programado_datos p ON p.operacion_id=o.id WHERE o.tipo='PEDIDO_PROGRAMADO' AND p.estado_preparacion<>'ANULADO' ORDER BY CASE WHEN p.estado_preparacion='ENTREGADO' THEN 1 ELSE 0 END,p.entrega_programada_local,o.creada_en_utc;`,
    );
    return Promise.all(rows.map((row) => this.get(text(row, 'id'))));
  }
  async registerAdvance(command: ScheduledAdvanceCommand): Promise<ScheduledOrderSummary> {
    await this.database.beginTransaction();
    try {
      const old = await this.database.query(
        `SELECT operacion_id FROM cobros WHERE clave_idempotencia=? LIMIT 1;`,
        [command.idempotencyKey],
      );
      if (old.length) {
        const result = await this.get(text(old[0], 'operacion_id'));
        await this.database.commitTransaction();
        return result;
      }
      const journeys = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (!journeys.length) throw new ScheduledOrderLockedError();
      const rows = await this.database.query(
        `SELECT o.saldo_centimos,o.pagado_centimos,p.estado_preparacion,p.jornada_entrega_id FROM operaciones o JOIN pedido_programado_datos p ON p.operacion_id=o.id WHERE o.id=? AND o.tipo='PEDIDO_PROGRAMADO' AND p.estado_preparacion NOT IN ('ANULADO') LIMIT 1;`,
        [command.operationId],
      );
      if (!rows.length) throw new ScheduledOrderLockedError();
      const amount = command.payments.reduce((sum, item) => sum + item.appliedCents, 0),
        balance = integer(rows[0], 'saldo_centimos') - amount;
      if (amount <= 0 || balance < 0) throw new ScheduledAdvanceInvalidError();
      const prepared = [] as {
        item: ScheduledAdvanceCommand['payments'][number];
        methodId: string;
        change: number;
      }[];
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
          throw new ScheduledAdvanceInvalidError();
        prepared.push({
          item,
          methodId: text(methods[0], 'id'),
          change: item.receivedCents - item.appliedCents,
        });
      }
      const journeyId = text(journeys[0], 'id'),
        delivered = rows[0]['estado_preparacion'] === 'ENTREGADO',
        paymentState =
          balance === 0 ? 'PAGADO' : delivered ? 'PAGADO_PARCIALMENTE' : 'CON_ADELANTO',
        operationState =
          balance === 0 ? (delivered ? 'FINALIZADA' : 'PAGADA') : 'PAGADA_PARCIALMENTE';
      await this.database.run(
        `INSERT INTO cobros (id,operacion_id,jornada_id,confirmado_por_usuario_id,tipo,importe_centimos,saldo_resultante_centimos,confirmado_en_utc,clave_idempotencia) VALUES (?,?,?,?,?,?,?, ?,?);`,
        [
          command.paymentId,
          command.operationId,
          journeyId,
          command.actorUserId,
          delivered ? 'PAGO_GENERAL_PEDIDO' : 'ADELANTO_PEDIDO',
          amount,
          balance,
          command.occurredAtUtc,
          command.idempotencyKey,
        ],
      );
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
            command.occurredAtUtc,
          ],
        );
      }
      await this.database.run(
        `UPDATE operaciones SET pagado_centimos=pagado_centimos+?,saldo_centimos=?,estado=?,jornada_venta_id=?,finalizada_por_usuario_id=?,finalizada_en_utc=?,version=version+1 WHERE id=?;`,
        [
          amount,
          balance,
          operationState,
          operationState === 'FINALIZADA' ? rows[0]['jornada_entrega_id'] : null,
          operationState === 'FINALIZADA' ? command.actorUserId : null,
          operationState === 'FINALIZADA' ? command.occurredAtUtc : null,
          command.operationId,
        ],
      );
      await this.database.run(
        `UPDATE pedido_programado_datos SET estado_pago=? WHERE operacion_id=?;`,
        [paymentState, command.operationId],
      );
      await this.audit(
        command.auditId,
        command.actorUserId,
        journeyId,
        'REGISTRAR_ADELANTO_PEDIDO',
        command.operationId,
        {
          cobro_id: command.paymentId,
          monto_centimos: amount,
          saldo_centimos: balance,
          estado_pago: paymentState,
        },
        command.occurredAtUtc,
      );
      const result = await this.get(command.operationId);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
  async transition(command: ScheduledTransitionCommand): Promise<ScheduledOrderSummary> {
    await this.database.beginTransaction();
    try {
      const old = await this.database.query(
        `SELECT entidad_id FROM auditoria WHERE id=? LIMIT 1;`,
        [command.idempotencyKey],
      );
      if (old.length) {
        if (old[0]['entidad_id'] !== command.operationId) throw new ScheduledOrderLockedError();
        const result = await this.get(command.operationId);
        await this.database.commitTransaction();
        return result;
      }
      const journeys = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (!journeys.length) throw new ScheduledOrderLockedError();
      const rows = await this.database.query(
        `SELECT p.estado_preparacion,o.saldo_centimos,o.pagado_centimos FROM pedido_programado_datos p JOIN operaciones o ON o.id=p.operacion_id WHERE p.operacion_id=? LIMIT 1;`,
        [command.operationId],
      );
      if (!rows.length || nextState(String(rows[0]['estado_preparacion'])) !== command.targetState)
        throw new ScheduledOrderLockedError();
      const journeyId = text(journeys[0], 'id'),
        delivered = command.targetState === 'ENTREGADO',
        balance = integer(rows[0], 'saldo_centimos'),
        paid = integer(rows[0], 'pagado_centimos'),
        paymentState = delivered
          ? balance === 0
            ? 'PAGADO'
            : paid > 0
              ? 'PAGADO_PARCIALMENTE'
              : 'PENDIENTE_DE_PAGO'
          : null;
      await this.database.run(
        `UPDATE pedido_programado_datos SET estado_preparacion=?,estado_pago=COALESCE(?,estado_pago),entregado_por_usuario_id=?,entregado_en_utc=?,jornada_entrega_id=? WHERE operacion_id=?;`,
        [
          command.targetState,
          paymentState,
          delivered ? command.actorUserId : null,
          delivered ? command.occurredAtUtc : null,
          delivered ? journeyId : null,
          command.operationId,
        ],
      );
      if (delivered && balance === 0)
        await this.database.run(
          `UPDATE operaciones SET estado='FINALIZADA',jornada_venta_id=?,finalizada_por_usuario_id=?,finalizada_en_utc=?,version=version+1 WHERE id=?;`,
          [journeyId, command.actorUserId, command.occurredAtUtc, command.operationId],
        );
      await this.audit(
        command.idempotencyKey,
        command.actorUserId,
        journeyId,
        'CAMBIAR_ESTADO_PREPARACION',
        command.operationId,
        {
          anterior: rows[0]['estado_preparacion'],
          nuevo: command.targetState,
          estado_pago: paymentState,
        },
        command.occurredAtUtc,
      );
      const result = await this.get(command.operationId);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
  private async get(id: string): Promise<ScheduledOrderSummary> {
    const rows = await this.database.query(
      `SELECT o.id,o.codigo,o.total_centimos,o.pagado_centimos,o.saldo_centimos,p.cliente_nombre_snapshot,p.cliente_telefono_snapshot,p.entrega_programada_local,p.tipo_entrega,p.direccion_snapshot,p.estado_preparacion,p.estado_pago FROM operaciones o JOIN pedido_programado_datos p ON p.operacion_id=o.id WHERE o.id=? LIMIT 1;`,
      [id],
    );
    if (!rows.length) throw new ScheduledOrderLockedError();
    const row = rows[0];
    const details = await this.database.query(
      `SELECT producto_nombre_snapshot,nota,cantidad_total,precio_aplicado_unitario_centimos,subtotal_centimos
         FROM operacion_detalles
        WHERE operacion_id=? AND detalle_principal_id IS NULL
        ORDER BY agregado_en_utc,id;`,
      [id],
    );
    return {
      operationId: text(row, 'id'),
      operationCode: text(row, 'codigo'),
      customerName: text(row, 'cliente_nombre_snapshot'),
      customerPhone: text(row, 'cliente_telefono_snapshot'),
      scheduledLocal: text(row, 'entrega_programada_local'),
      deliveryType: text(row, 'tipo_entrega') as 'RECOJO' | 'DOMICILIO',
      address: nullable(row, 'direccion_snapshot'),
      preparationState: text(row, 'estado_preparacion') as PreparationState,
      paymentState: text(row, 'estado_pago') as ScheduledOrderSummary['paymentState'],
      totalCents: integer(row, 'total_centimos'),
      paidCents: integer(row, 'pagado_centimos'),
      balanceCents: integer(row, 'saldo_centimos'),
      lines: details.map((detail) => ({
        name: text(detail, 'producto_nombre_snapshot'),
        presentation: nullable(detail, 'nota'),
        quantity: integer(detail, 'cantidad_total'),
        unitPriceCents: integer(detail, 'precio_aplicado_unitario_centimos'),
        subtotalCents: integer(detail, 'subtotal_centimos'),
      })),
    };
  }
  private async product(id: string, addon: boolean) {
    const rows = await this.database.query(
      `SELECT p.nombre,c.nombre AS categoria,p.precio_centimos,p.es_adicional,p.permite_adicionales FROM productos p JOIN categorias c ON c.id=p.categoria_id WHERE p.id=? AND p.activo=1 AND c.activo=1 AND p.disponibilidad='DISPONIBLE' LIMIT 1;`,
      [id],
    );
    if (!rows.length || (integer(rows[0], 'es_adicional') === 1) !== addon)
      throw new InvalidScheduledOrderError();
    return {
      name: text(rows[0], 'nombre'),
      category: text(rows[0], 'categoria'),
      priceCents: integer(rows[0], 'precio_centimos'),
      allowsAddons: integer(rows[0], 'permite_adicionales') === 1,
    };
  }
  private audit(
    id: string,
    user: string,
    journey: string,
    action: string,
    entity: string,
    values: unknown,
    time: string,
  ) {
    return this.database.run(
      `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,valores_anteriores_json,valores_nuevos_json,ocurrido_en_utc) VALUES (?,?,?,?,'OPERACION',?,NULL,?,?);`,
      [id, user, journey, action, entity, JSON.stringify(values), time],
    );
  }
}
interface Prepared {
  readonly id: string;
  readonly parent: string | null;
  readonly productId: string;
  readonly quantity: number;
  readonly name: string;
  readonly category: string;
  readonly priceCents: number;
  readonly allowsAddons: boolean;
  readonly note: string | null;
}
function nextState(current: string): PreparationState | null {
  return (
    (
      {
        REGISTRADO: 'PENDIENTE_DE_PREPARACION',
        PENDIENTE_DE_PREPARACION: 'EN_PREPARACION',
        EN_PREPARACION: 'LISTO',
        LISTO: 'ENTREGADO',
      } as Record<string, PreparationState>
    )[current] ?? null
  );
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
  if (typeof value !== 'number' && typeof value !== 'bigint')
    throw new Error(`Campo ${key} inválido.`);
  return Number(value);
}
