import { InjectionToken } from '@angular/core';

import type {
  PendingQuickSale,
  PendingQuickSaleAddon,
  PendingQuickSaleLine,
  PendingQuickSalesRepository,
} from '../../domain/sale/list-pending-quick-sales.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from './sqlite-quick-sale.repository';

export const PENDING_QUICK_SALES_REPOSITORY = new InjectionToken<PendingQuickSalesRepository>(
  'PENDING_QUICK_SALES_REPOSITORY',
);

export class SqlitePendingQuickSalesRepository implements PendingQuickSalesRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async list(): Promise<readonly PendingQuickSale[]> {
    const operations = await this.database.query(
      `SELECT o.id,o.codigo,o.total_centimos,o.creada_en_utc
         FROM operaciones o
         JOIN jornadas_caja j ON j.id=o.jornada_creacion_id AND j.estado='ABIERTA'
        WHERE o.tipo='VENTA_RAPIDA' AND o.estado='ABIERTA' AND o.saldo_centimos>0
        ORDER BY o.creada_en_utc ASC,o.codigo ASC;`,
    );
    const result: PendingQuickSale[] = [];
    for (const operation of operations) {
      const operationId = text(operation, 'id');
      const details = await this.database.query(
        `SELECT id,producto_id,detalle_principal_id,producto_nombre_snapshot,cantidad_total,
                precio_catalogo_unitario_centimos,precio_aplicado_unitario_centimos,
                tipo_ajuste_precio,motivo_ajuste_precio
           FROM operacion_detalles WHERE operacion_id=? ORDER BY agregado_en_utc ASC,id ASC;`,
        [operationId],
      );
      result.push({
        operationId,
        operationCode: text(operation, 'codigo'),
        totalCents: integer(operation, 'total_centimos'),
        createdAtUtc: text(operation, 'creada_en_utc'),
        lines: details
          .filter((detail) => detail['detalle_principal_id'] === null)
          .map((principal) => mapLine(principal, details)),
      });
    }
    return result;
  }
}

function mapLine(principal: QuickSaleRow, details: readonly QuickSaleRow[]): PendingQuickSaleLine {
  const detailId = text(principal, 'id');
  return {
    detailId,
    productId: text(principal, 'producto_id'),
    name: text(principal, 'producto_nombre_snapshot'),
    quantity: integer(principal, 'cantidad_total'),
    priceCents: integer(principal, 'precio_aplicado_unitario_centimos'),
    catalogPriceCents: integer(principal, 'precio_catalogo_unitario_centimos'),
    priceAdjustment:
      principal['tipo_ajuste_precio'] === 'NINGUNO'
        ? null
        : {
            type: text(principal, 'tipo_ajuste_precio') as 'DESCUENTO' | 'PRECIO_PERSONALIZADO',
            reason: text(principal, 'motivo_ajuste_precio'),
          },
    addons: details.filter((detail) => detail['detalle_principal_id'] === detailId).map(mapAddon),
  };
}

function mapAddon(row: QuickSaleRow): PendingQuickSaleAddon {
  return {
    detailId: text(row, 'id'),
    productId: text(row, 'producto_id'),
    name: text(row, 'producto_nombre_snapshot'),
    quantity: integer(row, 'cantidad_total'),
    priceCents: integer(row, 'precio_aplicado_unitario_centimos'),
  };
}

function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Campo ${key} inválido.`);
  return value;
}

function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Campo ${key} inválido.`);
  }
  return value;
}
