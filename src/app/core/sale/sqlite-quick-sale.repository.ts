import { InjectionToken } from '@angular/core';

import {
  OpenJourneyForQuickSaleRequiredError,
  QuickSaleAddonNotAllowedError,
  QuickSaleIdempotencyConflictError,
  QuickSaleProductUnavailableError,
  type CreatedQuickSale,
  type CreateQuickSaleCommand,
  type QuickSaleDetailCommand,
  type QuickSaleRepository,
} from '../../domain/sale/create-quick-sale.use-case';

export const QUICK_SALE_REPOSITORY = new InjectionToken<QuickSaleRepository>(
  'QUICK_SALE_REPOSITORY',
);

export type QuickSaleValue = string | number | bigint | null | Uint8Array;
export type QuickSaleRow = Readonly<Record<string, QuickSaleValue>>;

export interface QuickSaleDatabase {
  query(statement: string, values?: readonly QuickSaleValue[]): Promise<readonly QuickSaleRow[]>;
  run(statement: string, values?: readonly QuickSaleValue[]): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

interface ProductSnapshot {
  readonly id: string;
  readonly name: string;
  readonly categoryName: string;
  readonly priceCents: number;
  readonly isAddon: boolean;
  readonly allowsAddons: boolean;
  readonly allowsPriceChange: boolean;
}

export class SqliteQuickSaleRepository implements QuickSaleRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async create(command: CreateQuickSaleCommand): Promise<CreatedQuickSale> {
    await this.database.beginTransaction();
    try {
      const previous = await this.findByKey(command.idempotencyKey);
      if (previous.length > 0) {
        const same = await this.isSameRequest(previous[0], command);
        if (!same) throw new QuickSaleIdempotencyConflictError();
        const result = await this.mapCreated(previous[0]);
        await this.database.commitTransaction();
        return result;
      }

      const journeys = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado = 'ABIERTA' LIMIT 1;`,
      );
      if (journeys.length === 0) throw new OpenJourneyForQuickSaleRequiredError();
      const journeyId = text(journeys[0], 'id');
      const prepared = await this.prepareDetails(command.lines);
      const subtotalCatalogCents = prepared.reduce(
        (total, detail) => total + detail.quantity * detail.product.priceCents,
        0,
      );
      const totalCents = prepared.reduce((total, detail) => total + detail.subtotalCents, 0);
      const discountCents = prepared.reduce(
        (total, detail) =>
          total +
          (detail.adjustment?.type === 'DESCUENTO'
            ? (detail.product.priceCents - detail.appliedPriceCents) * detail.quantity
            : 0),
        0,
      );
      if (![subtotalCatalogCents, totalCents, discountCents].every(Number.isSafeInteger)) {
        throw new QuickSaleProductUnavailableError();
      }

      await this.database.run(
        `INSERT INTO operaciones (
          id,codigo,tipo,estado,jornada_creacion_id,creada_por_usuario_id,creada_en_utc,
          subtotal_catalogo_centimos,descuento_total_centimos,total_centimos,pagado_centimos,
          saldo_centimos,nota,clave_idempotencia,version
        ) VALUES (?,?,'VENTA_RAPIDA','ABIERTA',?,?,?,?,?,?,0,?,?,?,1);`,
        [
          command.operationId,
          command.operationCode,
          journeyId,
          command.actorUserId,
          command.createdAtUtc,
          subtotalCatalogCents,
          discountCents,
          totalCents,
          totalCents,
          command.note,
          command.idempotencyKey,
        ],
      );
      for (const detail of prepared) await this.insertDetail(command, detail);
      await this.database.run(
        `INSERT INTO auditoria (
          id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,
          valores_anteriores_json,valores_nuevos_json,motivo,ocurrido_en_utc
        ) VALUES (?,?,?,'CREAR_VENTA_RAPIDA','OPERACION',?,NULL,?,NULL,?);`,
        [
          command.auditId,
          command.actorUserId,
          journeyId,
          command.operationId,
          JSON.stringify({
            estado: 'ABIERTA',
            tipo: 'VENTA_RAPIDA',
            total_centimos: totalCents,
            cantidad_detalles: prepared.length,
          }),
          command.createdAtUtc,
        ],
      );
      const created = await this.findByKey(command.idempotencyKey);
      if (created.length !== 1) throw new Error('No se pudo verificar la venta rápida creada.');
      const result = await this.mapCreated(created[0]);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private async prepareDetails(
    lines: readonly QuickSaleDetailCommand[],
  ): Promise<readonly PreparedDetail[]> {
    const result: PreparedDetail[] = [];
    for (const line of lines) {
      const principal = await this.loadProduct(line.productId);
      if (principal.isAddon) throw new QuickSaleAddonNotAllowedError();
      result.push(prepare(line.detailId, null, line.quantity, principal, line.priceAdjustment));
      if (line.addons.length > 0 && !principal.allowsAddons) {
        throw new QuickSaleAddonNotAllowedError();
      }
      for (const addon of line.addons) {
        const product = await this.loadProduct(addon.productId);
        if (!product.isAddon) throw new QuickSaleAddonNotAllowedError();
        result.push(prepare(addon.detailId, line.detailId, addon.quantity, product, null));
      }
    }
    return result;
  }

  private async loadProduct(productId: string): Promise<ProductSnapshot> {
    const rows = await this.database.query(
      `SELECT p.id,p.nombre,c.nombre AS categoria_nombre,p.precio_centimos,p.es_adicional,
              p.permite_adicionales,p.permite_modificar_precio,p.activo,p.disponibilidad,
              c.activo AS categoria_activa
         FROM productos p JOIN categorias c ON c.id = p.categoria_id
        WHERE p.id = ? LIMIT 1;`,
      [productId],
    );
    if (
      rows.length === 0 ||
      integer(rows[0], 'activo') !== 1 ||
      integer(rows[0], 'categoria_activa') !== 1 ||
      rows[0]['disponibilidad'] !== 'DISPONIBLE'
    ) {
      throw new QuickSaleProductUnavailableError();
    }
    return {
      id: text(rows[0], 'id'),
      name: text(rows[0], 'nombre'),
      categoryName: text(rows[0], 'categoria_nombre'),
      priceCents: integer(rows[0], 'precio_centimos'),
      isAddon: integer(rows[0], 'es_adicional') === 1,
      allowsAddons: integer(rows[0], 'permite_adicionales') === 1,
      allowsPriceChange: integer(rows[0], 'permite_modificar_precio') === 1,
    };
  }

  private insertDetail(command: CreateQuickSaleCommand, detail: PreparedDetail): Promise<void> {
    return this.database.run(
      `INSERT INTO operacion_detalles (
        id,operacion_id,producto_id,detalle_principal_id,producto_nombre_snapshot,
        categoria_nombre_snapshot,cantidad_total,cantidad_servida,cantidad_pagada,
        precio_catalogo_unitario_centimos,precio_aplicado_unitario_centimos,tipo_ajuste_precio,
        motivo_ajuste_precio,ajustado_por_usuario_id,subtotal_centimos,estado_servicio,nota,
        agregado_por_usuario_id,agregado_en_utc
      ) VALUES (?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,'PENDIENTE',NULL,?,?);`,
      [
        detail.detailId,
        command.operationId,
        detail.product.id,
        detail.principalDetailId,
        detail.product.name,
        detail.product.categoryName,
        detail.quantity,
        detail.product.priceCents,
        detail.appliedPriceCents,
        detail.adjustment?.type ?? 'NINGUNO',
        detail.adjustment?.reason ?? null,
        detail.adjustment === null ? null : command.actorUserId,
        detail.subtotalCents,
        command.actorUserId,
        command.createdAtUtc,
      ],
    );
  }

  private findByKey(key: string): Promise<readonly QuickSaleRow[]> {
    return this.database.query(
      `SELECT o.id,o.codigo,o.jornada_creacion_id,o.estado,o.total_centimos,o.saldo_centimos,
              o.nota,o.creada_por_usuario_id,o.creada_en_utc
         FROM operaciones o WHERE o.clave_idempotencia = ? AND o.tipo = 'VENTA_RAPIDA' LIMIT 1;`,
      [key],
    );
  }

  private async isSameRequest(
    row: QuickSaleRow,
    command: CreateQuickSaleCommand,
  ): Promise<boolean> {
    if (row['creada_por_usuario_id'] !== command.actorUserId || row['nota'] !== command.note) {
      return false;
    }
    const details = await this.database.query(
      `SELECT id,producto_id,detalle_principal_id,cantidad_total,tipo_ajuste_precio,
              precio_aplicado_unitario_centimos,motivo_ajuste_precio
         FROM operacion_detalles WHERE operacion_id = ?;`,
      [text(row, 'id')],
    );
    return signatureFromRows(details) === signatureFromCommand(command);
  }

  private async mapCreated(row: QuickSaleRow): Promise<CreatedQuickSale> {
    const counts = await this.database.query(
      `SELECT COUNT(*) AS total FROM operacion_detalles WHERE operacion_id = ?;`,
      [text(row, 'id')],
    );
    return {
      operationId: text(row, 'id'),
      operationCode: text(row, 'codigo'),
      journeyId: text(row, 'jornada_creacion_id'),
      state: 'ABIERTA',
      totalCents: integer(row, 'total_centimos'),
      balanceCents: integer(row, 'saldo_centimos'),
      detailCount: integer(counts[0], 'total'),
      createdByUserId: text(row, 'creada_por_usuario_id'),
      createdAtUtc: text(row, 'creada_en_utc'),
    };
  }
}

interface PreparedDetail {
  readonly detailId: string;
  readonly principalDetailId: string | null;
  readonly quantity: number;
  readonly product: ProductSnapshot;
  readonly subtotalCents: number;
  readonly appliedPriceCents: number;
  readonly adjustment: QuickSaleDetailCommand['priceAdjustment'];
}

function prepare(
  detailId: string,
  principalDetailId: string | null,
  quantity: number,
  product: ProductSnapshot,
  adjustment: QuickSaleDetailCommand['priceAdjustment'],
): PreparedDetail {
  if (adjustment !== null) {
    if (!product.allowsPriceChange) throw new QuickSaleProductUnavailableError();
    if (
      (adjustment.type === 'DESCUENTO' && adjustment.appliedPriceCents >= product.priceCents) ||
      (adjustment.type === 'PRECIO_PERSONALIZADO' &&
        adjustment.appliedPriceCents === product.priceCents)
    ) {
      throw new QuickSaleProductUnavailableError();
    }
  }
  const appliedPriceCents = adjustment?.appliedPriceCents ?? product.priceCents;
  const subtotalCents = quantity * appliedPriceCents;
  if (!Number.isSafeInteger(subtotalCents)) throw new QuickSaleProductUnavailableError();
  return {
    detailId,
    principalDetailId,
    quantity,
    product,
    subtotalCents,
    appliedPriceCents,
    adjustment,
  };
}

function signatureFromCommand(command: CreateQuickSaleCommand): string {
  return command.lines
    .map(
      (line) =>
        `${line.productId}:${line.quantity}:${adjustmentSignature(line.priceAdjustment)}[${line.addons
          .map((addon) => `${addon.productId}:${addon.quantity}`)
          .sort()
          .join(',')}]`,
    )
    .sort()
    .join('|');
}

function adjustmentSignature(adjustment: QuickSaleDetailCommand['priceAdjustment']): string {
  return adjustment === null
    ? 'NINGUNO'
    : `${adjustment.type}:${adjustment.appliedPriceCents}:${adjustment.reason}`;
}

function signatureFromRows(rows: readonly QuickSaleRow[]): string {
  const principals = rows.filter((row) => row['detalle_principal_id'] === null);
  return principals
    .map((principal) => {
      const id = text(principal, 'id');
      const addons = rows
        .filter((row) => row['detalle_principal_id'] === id)
        .map((addon) => `${text(addon, 'producto_id')}:${integer(addon, 'cantidad_total')}`)
        .sort()
        .join(',');
      const type = text(principal, 'tipo_ajuste_precio');
      const adjustment =
        type === 'NINGUNO'
          ? 'NINGUNO'
          : `${type}:${integer(principal, 'precio_aplicado_unitario_centimos')}:${text(
              principal,
              'motivo_ajuste_precio',
            )}`;
      return `${text(principal, 'producto_id')}:${integer(
        principal,
        'cantidad_total',
      )}:${adjustment}[${addons}]`;
    })
    .sort()
    .join('|');
}

function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Campo ${key} inválido.`);
  return value;
}

function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error(`Campo ${key} inválido.`);
  return value;
}
