import { InjectionToken } from '@angular/core';

import {
  TableAccountLockedError,
  TableDetailLockedError,
  TableLinkUnavailableError,
  TableAccountMutationIdempotencyConflictError,
  type TableAccountLine,
  type TableAccountManagementRepository,
  type TableAccountMutationCommand,
  type TableAccountSnapshot,
} from '../../domain/table/manage-table-account.use-case';
import type { QuickSaleLineInput } from '../../domain/sale/create-quick-sale.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from '../sale/sqlite-quick-sale.repository';

export const TABLE_ACCOUNT_MANAGEMENT_REPOSITORY =
  new InjectionToken<TableAccountManagementRepository>('TABLE_ACCOUNT_MANAGEMENT_REPOSITORY');

export class SqliteTableAccountManagementRepository implements TableAccountManagementRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async load(operationId: string): Promise<TableAccountSnapshot> {
    const operations = await this.database.query(
      `SELECT o.id,o.codigo,o.estado,o.total_centimos,o.pagado_centimos,o.saldo_centimos,
              om.mesa_id,m.nombre AS mesa_nombre
         FROM operaciones o JOIN operacion_mesas om ON om.operacion_id=o.id
          AND om.rol_mesa='PRINCIPAL' AND om.liberada_en_utc IS NULL
         JOIN mesas m ON m.id=om.mesa_id WHERE o.id=? AND o.tipo='CUENTA_MESA' LIMIT 1;`,
      [operationId],
    );
    if (
      !operations.length ||
      operations[0]['estado'] === 'FINALIZADA' ||
      operations[0]['estado'] === 'ANULADA'
    )
      throw new TableAccountLockedError();
    const [details, linked] = await Promise.all([
      this.database.query(
        `SELECT d.id,d.producto_id,d.detalle_principal_id,d.producto_nombre_snapshot,d.cantidad_total,
                d.cantidad_servida,d.cantidad_pagada,d.precio_catalogo_unitario_centimos,
                d.precio_aplicado_unitario_centimos,d.subtotal_centimos,d.estado_servicio,
                p.permite_adicionales,p.permite_modificar_precio
           FROM operacion_detalles d JOIN productos p ON p.id=d.producto_id
          WHERE d.operacion_id=? ORDER BY d.agregado_en_utc,d.id;`,
        [operationId],
      ),
      this.database.query(
        `SELECT m.id,m.nombre FROM operacion_mesas om JOIN mesas m ON m.id=om.mesa_id
          WHERE om.operacion_id=? AND om.rol_mesa='VINCULADA' AND om.liberada_en_utc IS NULL
          ORDER BY m.orden,m.nombre;`,
        [operationId],
      ),
    ]);
    const children = new Map<string, ReturnType<typeof mapAddon>[]>();
    for (const row of details) {
      const parent = nullableText(row, 'detalle_principal_id');
      if (parent) {
        const items = children.get(parent) ?? [];
        items.push(mapAddon(row));
        children.set(parent, items);
      }
    }
    const lines: TableAccountLine[] = details
      .filter((row) => row['detalle_principal_id'] === null)
      .map((row) => ({
        ...mapAddon(row),
        catalogUnitPriceCents: integer(row, 'precio_catalogo_unitario_centimos'),
        allowsAddons: integer(row, 'permite_adicionales') === 1,
        allowsPriceChange: integer(row, 'permite_modificar_precio') === 1,
        addons: children.get(text(row, 'id')) ?? [],
      }));
    const row = operations[0];
    return {
      operationId: text(row, 'id'),
      operationCode: text(row, 'codigo'),
      state: text(row, 'estado') as TableAccountSnapshot['state'],
      totalCents: integer(row, 'total_centimos'),
      paidCents: integer(row, 'pagado_centimos'),
      balanceCents: integer(row, 'saldo_centimos'),
      principalTableId: text(row, 'mesa_id'),
      principalTableName: text(row, 'mesa_nombre'),
      linkedTables: linked.map((item) => ({ id: text(item, 'id'), name: text(item, 'nombre') })),
      lines,
    };
  }

  add(command: TableAccountMutationCommand): Promise<TableAccountSnapshot> {
    return this.mutate(command, 'AGREGAR_PRODUCTOS_CUENTA', async () => {
      await this.assertEditable(command.operationId);
      for (let index = 0; index < (command.lines ?? []).length; index++)
        await this.insertSelection(command, (command.lines ?? [])[index], index);
      await this.recalculate(command.operationId);
    });
  }
  addAddon(command: TableAccountMutationCommand): Promise<TableAccountSnapshot> {
    return this.mutate(command, 'AGREGAR_ADICIONAL_CUENTA', async () => {
      await this.assertEditable(command.operationId);
      const parents = await this.database.query(
        `SELECT p.permite_adicionales,d.estado_servicio,d.cantidad_pagada
        FROM operacion_detalles d JOIN productos p ON p.id=d.producto_id
        WHERE d.id=? AND d.operacion_id=? AND d.detalle_principal_id IS NULL LIMIT 1;`,
        [command.detailId!, command.operationId],
      );
      if (
        !parents.length ||
        integer(parents[0], 'permite_adicionales') !== 1 ||
        parents[0]['estado_servicio'] !== 'PENDIENTE' ||
        integer(parents[0], 'cantidad_pagada') > 0
      )
        throw new TableDetailLockedError();
      const product = await this.product(command.addonProductId!, true);
      await this.insertDetail(
        command,
        command.generatedDetailIds![0].principalId,
        command.detailId!,
        command.addonProductId!,
        1,
        product,
        product.price,
        'NINGUNO',
        null,
      );
      await this.recalculate(command.operationId);
    });
  }
  changeQuantity(command: TableAccountMutationCommand): Promise<TableAccountSnapshot> {
    return this.mutate(command, 'CAMBIAR_CANTIDAD_CUENTA', async () => {
      await this.assertEditable(command.operationId);
      const rows = await this.database.query(
        `SELECT cantidad_servida,cantidad_pagada,detalle_principal_id FROM operacion_detalles WHERE id=? AND operacion_id=? LIMIT 1;`,
        [command.detailId!, command.operationId],
      );
      if (
        !rows.length ||
        integer(rows[0], 'cantidad_servida') > 0 ||
        integer(rows[0], 'cantidad_pagada') > 0
      )
        throw new TableDetailLockedError();
      if (command.targetQuantity === 0) {
        if (rows[0]['detalle_principal_id'] !== null)
          await this.database.run(`DELETE FROM operacion_detalles WHERE id=?;`, [
            command.detailId!,
          ]);
        else
          await this.database.run(
            `DELETE FROM operacion_detalles WHERE id=? AND cantidad_servida=0 AND cantidad_pagada=0;`,
            [command.detailId!],
          );
      } else
        await this.database.run(
          `UPDATE operacion_detalles SET cantidad_total=?,subtotal_centimos=?*precio_aplicado_unitario_centimos WHERE id=?;`,
          [command.targetQuantity!, command.targetQuantity!, command.detailId!],
        );
      await this.recalculate(command.operationId);
    });
  }
  markServed(command: TableAccountMutationCommand): Promise<TableAccountSnapshot> {
    return this.mutate(command, 'MARCAR_PRODUCTO_SERVIDO', async () => {
      await this.assertEditable(command.operationId);
      const rows = await this.database.query(
        `SELECT detalle_principal_id FROM operacion_detalles WHERE id=? AND operacion_id=? LIMIT 1;`,
        [command.detailId!, command.operationId],
      );
      if (!rows.length || rows[0]['detalle_principal_id'] !== null)
        throw new TableDetailLockedError();
      await this.database.run(
        `UPDATE operacion_detalles SET cantidad_servida=cantidad_total,estado_servicio='SERVIDO'
        WHERE operacion_id=? AND (id=? OR detalle_principal_id=?);`,
        [command.operationId, command.detailId!, command.detailId!],
      );
    });
  }
  linkTable(command: TableAccountMutationCommand): Promise<TableAccountSnapshot> {
    return this.mutate(command, 'UNIR_MESA', async () => {
      await this.assertEditable(command.operationId);
      const target = await this.database.query(
        `SELECT id FROM mesas WHERE id=? AND activo=1
        AND NOT EXISTS(SELECT 1 FROM operacion_mesas WHERE mesa_id=mesas.id AND liberada_en_utc IS NULL) LIMIT 1;`,
        [command.tableId!],
      );
      if (!target.length) throw new TableLinkUnavailableError();
      await this.database.run(
        `INSERT INTO operacion_mesas (id,operacion_id,mesa_id,rol_mesa,vinculada_por_usuario_id,vinculada_en_utc)
        VALUES (?,?,?,'VINCULADA',?,?);`,
        [
          command.requestKey,
          command.operationId,
          command.tableId!,
          command.actorUserId,
          command.occurredAtUtc,
        ],
      );
    });
  }
  unlinkTable(command: TableAccountMutationCommand): Promise<TableAccountSnapshot> {
    return this.mutate(command, 'SEPARAR_MESA', async () => {
      await this.assertEditable(command.operationId);
      const links = await this.database.query(
        `SELECT id FROM operacion_mesas WHERE operacion_id=? AND mesa_id=? AND rol_mesa='VINCULADA' AND liberada_en_utc IS NULL LIMIT 1;`,
        [command.operationId, command.tableId!],
      );
      if (!links.length) throw new TableLinkUnavailableError();
      await this.database.run(
        `UPDATE operacion_mesas SET liberada_por_usuario_id=?,liberada_en_utc=? WHERE id=?;`,
        [command.actorUserId, command.occurredAtUtc, text(links[0], 'id')],
      );
    });
  }

  private async mutate(
    command: TableAccountMutationCommand,
    action: string,
    work: () => Promise<void>,
  ): Promise<TableAccountSnapshot> {
    await this.database.beginTransaction();
    try {
      const previous = await this.database.query(
        `SELECT accion,entidad_id,valores_nuevos_json FROM auditoria WHERE id=? LIMIT 1;`,
        [command.requestKey],
      );
      if (previous.length) {
        if (
          previous[0]['accion'] !== action ||
          previous[0]['entidad_id'] !== command.operationId ||
          previous[0]['valores_nuevos_json'] !== JSON.stringify(fingerprint(command))
        )
          throw new TableAccountMutationIdempotencyConflictError();
        const result = await this.load(command.operationId);
        await this.database.commitTransaction();
        return result;
      }
      const journey = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (!journey.length) throw new TableAccountLockedError();
      await work();
      await this.database.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,valores_anteriores_json,valores_nuevos_json,motivo,ocurrido_en_utc)
        VALUES (?,?,? ,?,'OPERACION',?,NULL,?,NULL,?);`,
        [
          command.requestKey,
          command.actorUserId,
          text(journey[0], 'id'),
          action,
          command.operationId,
          JSON.stringify(fingerprint(command)),
          command.occurredAtUtc,
        ],
      );
      const result = await this.load(command.operationId);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
  private async assertEditable(operationId: string): Promise<void> {
    const rows = await this.database.query(
      `SELECT estado FROM operaciones WHERE id=? AND tipo='CUENTA_MESA' LIMIT 1;`,
      [operationId],
    );
    if (!rows.length || rows[0]['estado'] === 'FINALIZADA' || rows[0]['estado'] === 'ANULADA')
      throw new TableAccountLockedError();
  }
  private async insertSelection(
    command: TableAccountMutationCommand,
    line: QuickSaleLineInput,
    index: number,
  ): Promise<void> {
    const principal = await this.product(line.productId, false);
    const generated = command.generatedDetailIds![index];
    const applied = line.priceAdjustment?.appliedPriceCents ?? principal.price;
    if (applied !== principal.price && !principal.changePrice) throw new TableDetailLockedError();
    await this.insertDetail(
      command,
      generated.principalId,
      null,
      line.productId,
      line.quantity,
      principal,
      applied,
      line.priceAdjustment?.type ?? 'NINGUNO',
      line.priceAdjustment?.reason ?? null,
    );
    if ((line.addons ?? []).length && !principal.addons) throw new TableDetailLockedError();
    for (let addonIndex = 0; addonIndex < (line.addons ?? []).length; addonIndex++) {
      const addon = (line.addons ?? [])[addonIndex];
      const product = await this.product(addon.productId, true);
      await this.insertDetail(
        command,
        generated.addonIds[addonIndex],
        generated.principalId,
        addon.productId,
        addon.quantity,
        product,
        product.price,
        'NINGUNO',
        null,
      );
    }
  }
  private async product(productId: string, addon: boolean) {
    const rows = await this.database.query(
      `SELECT p.id,p.nombre,c.nombre AS categoria,p.precio_centimos,p.es_adicional,p.permite_adicionales,p.permite_modificar_precio
      FROM productos p JOIN categorias c ON c.id=p.categoria_id WHERE p.id=? AND p.activo=1 AND c.activo=1 AND p.disponibilidad='DISPONIBLE' LIMIT 1;`,
      [productId],
    );
    if (!rows.length || (integer(rows[0], 'es_adicional') === 1) !== addon)
      throw new TableDetailLockedError();
    return {
      name: text(rows[0], 'nombre'),
      category: text(rows[0], 'categoria'),
      price: integer(rows[0], 'precio_centimos'),
      addons: integer(rows[0], 'permite_adicionales') === 1,
      changePrice: integer(rows[0], 'permite_modificar_precio') === 1,
    };
  }
  private insertDetail(
    command: TableAccountMutationCommand,
    id: string,
    parent: string | null,
    productId: string,
    quantity: number,
    product: { name: string; category: string; price: number },
    applied: number,
    type: string,
    reason: string | null,
  ): Promise<void> {
    return this.database.run(
      `INSERT INTO operacion_detalles (id,operacion_id,producto_id,detalle_principal_id,producto_nombre_snapshot,categoria_nombre_snapshot,cantidad_total,cantidad_servida,cantidad_pagada,precio_catalogo_unitario_centimos,precio_aplicado_unitario_centimos,tipo_ajuste_precio,motivo_ajuste_precio,ajustado_por_usuario_id,subtotal_centimos,estado_servicio,nota,agregado_por_usuario_id,agregado_en_utc)
      VALUES (?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,'PENDIENTE',NULL,?,?);`,
      [
        id,
        command.operationId,
        productId,
        parent,
        product.name,
        product.category,
        quantity,
        product.price,
        applied,
        type,
        reason,
        type === 'NINGUNO' ? null : command.actorUserId,
        quantity * applied,
        command.actorUserId,
        command.occurredAtUtc,
      ],
    );
  }
  private async recalculate(operationId: string): Promise<void> {
    const sums = await this.database.query(
      `SELECT COALESCE(SUM(cantidad_total*precio_catalogo_unitario_centimos),0) AS catalogo,
      COALESCE(SUM(CASE WHEN tipo_ajuste_precio='DESCUENTO' THEN cantidad_total*(precio_catalogo_unitario_centimos-precio_aplicado_unitario_centimos) ELSE 0 END),0) AS descuento,
      COALESCE(SUM(subtotal_centimos),0) AS total FROM operacion_detalles WHERE operacion_id=?;`,
      [operationId],
    );
    const operation = await this.database.query(
      `SELECT pagado_centimos FROM operaciones WHERE id=?;`,
      [operationId],
    );
    const total = integer(sums[0], 'total'),
      paid = integer(operation[0], 'pagado_centimos');
    if (total < paid) throw new TableDetailLockedError();
    const state = paid === 0 ? 'ABIERTA' : total === paid ? 'PAGADA' : 'PAGADA_PARCIALMENTE';
    await this.database.run(
      `UPDATE operaciones SET subtotal_catalogo_centimos=?,descuento_total_centimos=?,total_centimos=?,saldo_centimos=?,estado=?,version=version+1 WHERE id=?;`,
      [
        integer(sums[0], 'catalogo'),
        integer(sums[0], 'descuento'),
        total,
        total - paid,
        state,
        operationId,
      ],
    );
  }
}
function mapAddon(row: QuickSaleRow) {
  return {
    detailId: text(row, 'id'),
    productId: text(row, 'producto_id'),
    name: text(row, 'producto_nombre_snapshot'),
    quantity: integer(row, 'cantidad_total'),
    servedQuantity: integer(row, 'cantidad_servida'),
    paidQuantity: integer(row, 'cantidad_pagada'),
    unitPriceCents: integer(row, 'precio_aplicado_unitario_centimos'),
    subtotalCents: integer(row, 'subtotal_centimos'),
    serviceState: text(row, 'estado_servicio') as 'PENDIENTE' | 'SERVIDO',
  };
}
function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Valor SQLite inválido: ${key}`);
  return value;
}
function nullableText(row: QuickSaleRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`Valor SQLite inválido: ${key}`);
  return value;
}
function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' && typeof value !== 'bigint')
    throw new Error(`Valor SQLite inválido: ${key}`);
  return Number(value);
}
function fingerprint(command: TableAccountMutationCommand) {
  return {
    operationId: command.operationId,
    detailId: command.detailId ?? null,
    targetQuantity: command.targetQuantity ?? null,
    tableId: command.tableId ?? null,
    addonProductId: command.addonProductId ?? null,
    lines: command.lines ?? null,
    actorUserId: command.actorUserId,
  };
}
