import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteSaleCatalogRepository,
  type CatalogQueryDatabase,
  type CatalogQueryRow,
  type CatalogQueryValue,
} from '../../src/app/core/catalog/sqlite-sale-catalog.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import { MIGRATION_V3 } from '../../src/app/core/database/migrations/migration-v3';

describe('SqliteSaleCatalogRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteSaleCatalogRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    repository = new SqliteSaleCatalogRepository(new NodeCatalogDatabase(database));
  });

  afterEach(() => database.close());

  it('lists active direct-sale products in configured category and product order', async () => {
    const catalog = await repository.listForSale();

    expect(catalog.categories).toEqual([
      { code: 'KANKACHO', name: 'Kankacho', order: 1 },
      { code: 'BEBIDAS', name: 'Bebidas', order: 2 },
    ]);
    expect(catalog.products).toHaveLength(18);
    expect(catalog.products[0]).toMatchObject({
      code: 'KANKACHO_15',
      categoryCode: 'KANKACHO',
      name: 'Kankacho S/15',
      priceCents: 1500,
      availability: 'DISPONIBLE',
      allowsAddons: true,
      allowsPriceChange: true,
    });
    expect(catalog.products[3]).toMatchObject({ code: 'INKA_192', categoryCode: 'BEBIDAS' });
    expect(catalog.products.some((product) => product.code.includes('ADICIONAL'))).toBe(false);
    expect(catalog.addons).toHaveLength(5);
    expect(catalog.addons?.[1]).toMatchObject({ code: 'PAPA_ADICIONAL_2', priceCents: 200 });
  });

  it('keeps exhausted products visible and omits inactive products', async () => {
    database.exec("UPDATE productos SET disponibilidad = 'AGOTADO' WHERE codigo = 'KANKACHO_25';");
    database.exec("UPDATE productos SET activo = 0 WHERE codigo = 'INKA_192';");

    const catalog = await repository.listForSale();

    expect(catalog.products.find((product) => product.code === 'KANKACHO_25')?.availability).toBe(
      'AGOTADO',
    );
    expect(catalog.products.some((product) => product.code === 'INKA_192')).toBe(false);
  });

  it('returns the current local image without exposing retired images', async () => {
    const product = database
      .prepare("SELECT id FROM productos WHERE codigo = 'KANKACHO_20'")
      .get() as {
      id: string;
    };
    database
      .prepare(
        `INSERT INTO producto_imagenes (
        id, producto_id, ruta_local, tipo_mime, ancho_px, alto_px, tamano_bytes,
        checksum_sha256, activa, creada_en_utc
      ) VALUES ('image-current', ?, 'products/kankacho-20.webp', 'image/webp',
                512, 512, 12000, ?, 1, '2026-07-29T22:00:00.000Z');`,
      )
      .run(product.id, 'a'.repeat(64));

    const catalog = await repository.listForSale();

    expect(
      catalog.products.find((catalogProduct) => catalogProduct.code === 'KANKACHO_20')
        ?.currentImagePath,
    ).toBe('products/kankacho-20.webp');
  });
});

class NodeCatalogDatabase implements CatalogQueryDatabase {
  constructor(private readonly database: DatabaseSync) {}

  async query(
    statement: string,
    values: readonly CatalogQueryValue[] = [],
  ): Promise<readonly CatalogQueryRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }
}
