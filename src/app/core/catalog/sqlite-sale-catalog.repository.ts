import { InjectionToken } from '@angular/core';

import type {
  CatalogProductAvailability,
  SaleCatalog,
  SaleCatalogAddon,
  SaleCatalogCategory,
  SaleCatalogProduct,
  SaleCatalogRepository,
} from '../../domain/catalog/list-sale-catalog.use-case';

export const SALE_CATALOG_REPOSITORY = new InjectionToken<SaleCatalogRepository>(
  'SALE_CATALOG_REPOSITORY',
);

export type CatalogQueryValue = string | number | bigint | null | Uint8Array;
export type CatalogQueryRow = Readonly<Record<string, CatalogQueryValue>>;

export interface CatalogQueryDatabase {
  query(
    statement: string,
    values?: readonly CatalogQueryValue[],
  ): Promise<readonly CatalogQueryRow[]>;
}

export class SqliteSaleCatalogRepository implements SaleCatalogRepository {
  constructor(private readonly database: CatalogQueryDatabase) {}

  async listForSale(): Promise<SaleCatalog> {
    const rows = await this.database.query(
      `SELECT c.codigo AS categoria_codigo, c.nombre AS categoria_nombre,
              c.orden AS categoria_orden, p.id, p.codigo, p.nombre,
              p.descripcion, p.presentacion, p.precio_centimos, p.disponibilidad,
              p.permite_adicionales, p.permite_modificar_precio,
              pi.ruta_local AS imagen_ruta_local
         FROM productos p
         JOIN categorias c ON c.id = p.categoria_id
         LEFT JOIN producto_imagenes pi ON pi.producto_id = p.id AND pi.activa = 1
        WHERE p.activo = 1 AND p.es_adicional = 0 AND c.activo = 1
          AND p.codigo <> 'PEDIDO_PERSONALIZADO'
        ORDER BY c.orden, c.nombre_normalizado, p.orden, p.nombre_normalizado;`,
    );
    const categories = new Map<string, SaleCatalogCategory>();
    const products: SaleCatalogProduct[] = [];

    for (const row of rows) {
      const categoryCode = requireString(row, 'categoria_codigo');
      categories.set(categoryCode, {
        code: categoryCode,
        name: requireString(row, 'categoria_nombre'),
        order: requireInteger(row, 'categoria_orden'),
      });
      products.push({
        id: requireString(row, 'id'),
        code: requireString(row, 'codigo'),
        categoryCode,
        name: requireString(row, 'nombre'),
        description: optionalString(row, 'descripcion'),
        presentation: optionalString(row, 'presentacion'),
        priceCents: requireInteger(row, 'precio_centimos'),
        availability: requireAvailability(row['disponibilidad']),
        allowsAddons: requireBoolean(row, 'permite_adicionales'),
        allowsPriceChange: requireBoolean(row, 'permite_modificar_precio'),
        currentImagePath: optionalString(row, 'imagen_ruta_local'),
      });
    }

    const addonRows = await this.database.query(
      `SELECT p.id,p.codigo,p.nombre,p.precio_centimos,p.disponibilidad
         FROM productos p JOIN categorias c ON c.id=p.categoria_id
        WHERE p.activo=1 AND p.es_adicional=1 AND c.activo=1
        ORDER BY p.orden,p.nombre_normalizado;`,
    );
    const addons: SaleCatalogAddon[] = addonRows.map((row) => ({
      id: requireString(row, 'id'),
      code: requireString(row, 'codigo'),
      name: requireString(row, 'nombre'),
      priceCents: requireInteger(row, 'precio_centimos'),
      availability: requireAvailability(row['disponibilidad']),
    }));
    return { categories: [...categories.values()], products, addons };
  }
}

function requireString(row: CatalogQueryRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El campo ${key} del catálogo no es válido.`);
  }
  return value;
}

function optionalString(row: CatalogQueryRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El campo ${key} del catálogo no es válido.`);
  }
  return value;
}

function requireInteger(row: CatalogQueryRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`El campo ${key} del catálogo no es válido.`);
  }
  return value;
}

function requireBoolean(row: CatalogQueryRow, key: string): boolean {
  const value = requireInteger(row, key);
  if (value !== 0 && value !== 1) throw new Error(`El campo ${key} del catálogo no es válido.`);
  return value === 1;
}

function requireAvailability(value: CatalogQueryValue | undefined): CatalogProductAvailability {
  if (value === 'DISPONIBLE' || value === 'AGOTADO') return value;
  throw new Error('El estado de disponibilidad del catálogo no es válido.');
}
