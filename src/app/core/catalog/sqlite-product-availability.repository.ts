import { InjectionToken } from '@angular/core';

import {
  ActiveProductNotFoundError,
  type ProductAvailabilityChange,
  type ProductAvailabilityChangeResult,
  type ProductAvailabilityRepository,
} from '../../domain/catalog/change-product-availability.use-case';
import type { CatalogProductAvailability } from '../../domain/catalog/list-sale-catalog.use-case';

export const PRODUCT_AVAILABILITY_REPOSITORY = new InjectionToken<ProductAvailabilityRepository>(
  'PRODUCT_AVAILABILITY_REPOSITORY',
);

export type CatalogWriteValue = string | number | bigint | null | Uint8Array;
export type CatalogWriteRow = Readonly<Record<string, CatalogWriteValue>>;

export interface CatalogWriteDatabase {
  query(
    statement: string,
    values?: readonly CatalogWriteValue[],
  ): Promise<readonly CatalogWriteRow[]>;
  run(statement: string, values?: readonly CatalogWriteValue[]): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

export class SqliteProductAvailabilityRepository implements ProductAvailabilityRepository {
  constructor(private readonly database: CatalogWriteDatabase) {}

  async change(change: ProductAvailabilityChange): Promise<ProductAvailabilityChangeResult> {
    await this.database.beginTransaction();
    try {
      const rows = await this.database.query(
        `SELECT disponibilidad
           FROM productos
          WHERE id = ? AND activo = 1
          LIMIT 1;`,
        [change.productId],
      );
      if (rows.length === 0) throw new ActiveProductNotFoundError();

      const previousAvailability = requireAvailability(rows[0]['disponibilidad']);
      if (previousAvailability === change.availability) {
        await this.database.commitTransaction();
        return {
          productId: change.productId,
          previousAvailability,
          currentAvailability: change.availability,
          changed: false,
        };
      }

      await this.database.run(
        `UPDATE productos
            SET disponibilidad = ?, actualizado_por_usuario_id = ?, actualizado_en_utc = ?
          WHERE id = ? AND activo = 1;`,
        [change.availability, change.actorUserId, change.occurredAtUtc, change.productId],
      );
      await this.database.run(
        `INSERT INTO auditoria (
           id, usuario_id, jornada_id, accion, entidad_tipo, entidad_id,
           valores_anteriores_json, valores_nuevos_json, motivo, ocurrido_en_utc
         ) VALUES (?, ?, NULL, 'CAMBIAR_DISPONIBILIDAD_PRODUCTO', 'PRODUCTO', ?, ?, ?, NULL, ?);`,
        [
          change.auditId,
          change.actorUserId,
          change.productId,
          JSON.stringify({ disponibilidad: previousAvailability }),
          JSON.stringify({ disponibilidad: change.availability }),
          change.occurredAtUtc,
        ],
      );
      await this.database.commitTransaction();
      return {
        productId: change.productId,
        previousAvailability,
        currentAvailability: change.availability,
        changed: true,
      };
    } catch (error: unknown) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
}

function requireAvailability(value: CatalogWriteValue | undefined): CatalogProductAvailability {
  if (value === 'DISPONIBLE' || value === 'AGOTADO') return value;
  throw new Error('El estado de disponibilidad almacenado no es válido.');
}
