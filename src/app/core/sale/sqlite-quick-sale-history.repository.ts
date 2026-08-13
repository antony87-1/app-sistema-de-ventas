import { InjectionToken } from '@angular/core';

import type {
  QuickSaleHistoryItem,
  QuickSaleHistoryRepository,
} from '../../domain/sale/list-quick-sale-history.use-case';
import type {
  PendingQuickSaleAddon,
  PendingQuickSaleLine,
} from '../../domain/sale/list-pending-quick-sales.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from './sqlite-quick-sale.repository';

export const QUICK_SALE_HISTORY_REPOSITORY = new InjectionToken<QuickSaleHistoryRepository>(
  'QUICK_SALE_HISTORY_REPOSITORY',
);

export class SqliteQuickSaleHistoryRepository implements QuickSaleHistoryRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async list(): Promise<readonly QuickSaleHistoryItem[]> {
    const operations = await this.database.query(
      `SELECT o.id,o.codigo,o.estado,o.total_centimos,o.creada_en_utc,o.finalizada_en_utc,
              o.anulada_en_utc,o.motivo_anulacion
         FROM operaciones o JOIN jornadas_caja j ON j.id=o.jornada_creacion_id
        WHERE j.estado='ABIERTA' AND o.tipo='VENTA_RAPIDA'
          AND o.estado IN ('FINALIZADA','ANULADA')
        ORDER BY COALESCE(o.finalizada_en_utc,o.anulada_en_utc) DESC,o.codigo DESC;`,
    );
    const result: QuickSaleHistoryItem[] = [];
    for (const operation of operations) {
      const operationId = text(operation, 'id');
      const details = await this.database.query(
        `SELECT id,producto_id,detalle_principal_id,producto_nombre_snapshot,cantidad_total,
                precio_catalogo_unitario_centimos,precio_aplicado_unitario_centimos,
                tipo_ajuste_precio,motivo_ajuste_precio
           FROM operacion_detalles WHERE operacion_id=? ORDER BY agregado_en_utc,id;`,
        [operationId],
      );
      const methods = await this.database.query(
        `SELECT DISTINCT mp.nombre FROM cobros c JOIN cobro_metodos cm ON cm.cobro_id=c.id
          JOIN metodos_pago mp ON mp.id=cm.metodo_pago_id WHERE c.operacion_id=? ORDER BY mp.nombre;`,
        [operationId],
      );
      const state = text(operation, 'estado') as 'FINALIZADA' | 'ANULADA';
      result.push({
        operationId,
        operationCode: text(operation, 'codigo'),
        state,
        totalCents: integer(operation, 'total_centimos'),
        createdAtUtc: text(operation, 'creada_en_utc'),
        closedAtUtc: text(
          operation,
          state === 'FINALIZADA' ? 'finalizada_en_utc' : 'anulada_en_utc',
        ),
        cancellationReason: optionalText(operation, 'motivo_anulacion'),
        paymentMethods: methods.map((method) => text(method, 'nombre')),
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
function optionalText(row: QuickSaleRow, key: string): string | null {
  return row[key] === null ? null : text(row, key);
}
function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value) throw new Error(`Campo ${key} inválido.`);
  return value;
}
function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error(`Campo ${key} inválido.`);
  return value;
}
