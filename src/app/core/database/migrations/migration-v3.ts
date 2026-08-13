import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';

export const MIGRATION_V3_CHECKSUM =
  'f2a84f318fa8c327d16cdd447fad8c3ad93c5e1431e3426c1c1c2fe848bb934b';

export const MIGRATION_V3_SCHEMA_STATEMENTS: readonly string[] = [
  `DROP INDEX IF EXISTS ux_operacion_mesas_mesa_activa;`,
  `CREATE TRIGGER IF NOT EXISTS tr_operacion_mesas_max_dos_insert
     BEFORE INSERT ON operacion_mesas
     WHEN NEW.liberada_en_utc IS NULL
      AND (SELECT COUNT(*) FROM operacion_mesas
           WHERE mesa_id = NEW.mesa_id AND liberada_en_utc IS NULL) >= 2
     BEGIN
       SELECT RAISE(ABORT, 'TABLE_ACTIVE_ACCOUNT_LIMIT');
     END;`,
  `CREATE TRIGGER IF NOT EXISTS tr_operacion_mesas_max_dos_update
     BEFORE UPDATE ON operacion_mesas
     WHEN NEW.liberada_en_utc IS NULL
      AND (SELECT COUNT(*) FROM operacion_mesas
           WHERE mesa_id = NEW.mesa_id AND liberada_en_utc IS NULL AND id <> NEW.id) >= 2
     BEGIN
       SELECT RAISE(ABORT, 'TABLE_ACTIVE_ACCOUNT_LIMIT');
     END;`,
  `ALTER TABLE productos ADD COLUMN descripcion TEXT
     CHECK (descripcion IS NULL OR length(trim(descripcion)) > 0);`,
  `ALTER TABLE productos ADD COLUMN marca TEXT
     CHECK (marca IS NULL OR length(trim(marca)) > 0);`,
  `ALTER TABLE productos ADD COLUMN presentacion TEXT
     CHECK (presentacion IS NULL OR length(trim(presentacion)) > 0);`,
  `ALTER TABLE productos ADD COLUMN contenido_cantidad INTEGER
     CHECK (contenido_cantidad IS NULL OR contenido_cantidad > 0);`,
  `ALTER TABLE productos ADD COLUMN unidad_medida TEXT
     CHECK (unidad_medida IS NULL OR unidad_medida IN ('PORCION', 'ML', 'TAZA'));`,
  `ALTER TABLE productos ADD COLUMN tipo_envase TEXT
     CHECK (tipo_envase IS NULL OR length(trim(tipo_envase)) > 0);`,
  `ALTER TABLE productos ADD COLUMN permite_adicionales INTEGER NOT NULL DEFAULT 0
     CHECK (permite_adicionales IN (0, 1));`,
  `ALTER TABLE productos ADD COLUMN permite_modificar_precio INTEGER NOT NULL DEFAULT 0
     CHECK (permite_modificar_precio IN (0, 1));`,
  `ALTER TABLE productos ADD COLUMN orden INTEGER NOT NULL DEFAULT 0
     CHECK (orden >= 0);`,
  `ALTER TABLE productos ADD COLUMN actualizado_por_usuario_id TEXT
     REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT;`,
  `CREATE TABLE IF NOT EXISTS producto_imagenes (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    producto_id TEXT NOT NULL,
    ruta_local TEXT NOT NULL UNIQUE CHECK (length(trim(ruta_local)) > 0),
    tipo_mime TEXT NOT NULL CHECK (tipo_mime IN ('image/webp', 'image/jpeg', 'image/png')),
    ancho_px INTEGER NOT NULL CHECK (ancho_px > 0),
    alto_px INTEGER NOT NULL CHECK (alto_px > 0),
    tamano_bytes INTEGER NOT NULL CHECK (tamano_bytes > 0),
    checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64),
    activa INTEGER NOT NULL CHECK (activa IN (0, 1)),
    creada_por_usuario_id TEXT,
    creada_en_utc TEXT NOT NULL CHECK (length(trim(creada_en_utc)) > 0),
    retirada_por_usuario_id TEXT,
    retirada_en_utc TEXT,
    CHECK (
      (activa = 1 AND retirada_por_usuario_id IS NULL AND retirada_en_utc IS NULL) OR
      (activa = 0 AND retirada_en_utc IS NOT NULL)
    ),
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (creada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (retirada_por_usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_imagen_activa
     ON producto_imagenes (producto_id) WHERE activa = 1;`,
  `CREATE INDEX IF NOT EXISTS idx_producto_imagenes_historial
     ON producto_imagenes (producto_id, creada_en_utc);`,
  `CREATE INDEX IF NOT EXISTS idx_productos_venta
     ON productos (categoria_id, activo, disponibilidad, orden);`,
  `CREATE INDEX IF NOT EXISTS idx_productos_marca_presentacion
     ON productos (marca, contenido_cantidad, unidad_medida);`,
];

const CATEGORY_IDS = {
  KANKACHO: '00000000-0000-7000-8000-000000000100',
  BEBIDAS: '00000000-0000-7000-8000-000000000101',
  ADICIONALES: '00000000-0000-7000-8000-000000000102',
} as const;

interface SeedProduct {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly category: keyof typeof CATEGORY_IDS;
  readonly brand?: string;
  readonly presentation: string;
  readonly content?: number;
  readonly unit: 'PORCION' | 'ML' | 'TAZA';
  readonly price: number;
  readonly addon?: boolean;
  readonly allowsAddons?: boolean;
  readonly allowsPriceChange?: boolean;
  readonly order: number;
}

const INITIAL_PRODUCTS: readonly SeedProduct[] = [
  {
    code: 'KANKACHO_15',
    name: 'Kankacho S/15',
    description: 'Porción pequeña',
    category: 'KANKACHO',
    presentation: 'Pequeña',
    unit: 'PORCION',
    price: 1500,
    allowsAddons: true,
    allowsPriceChange: true,
    order: 1,
  },
  {
    code: 'KANKACHO_20',
    name: 'Kankacho S/20',
    description: 'Porción normal',
    category: 'KANKACHO',
    presentation: 'Normal',
    unit: 'PORCION',
    price: 2000,
    allowsAddons: true,
    allowsPriceChange: true,
    order: 2,
  },
  {
    code: 'KANKACHO_25',
    name: 'Kankacho S/25',
    description: 'Porción bien servida',
    category: 'KANKACHO',
    presentation: 'Bien servida',
    unit: 'PORCION',
    price: 2500,
    allowsAddons: true,
    allowsPriceChange: true,
    order: 3,
  },
  {
    code: 'INKA_192',
    name: 'Inca Kola personal 192 ml',
    description: 'Presentación personal',
    category: 'BEBIDAS',
    brand: 'Inca Kola',
    presentation: 'Personal',
    content: 192,
    unit: 'ML',
    price: 150,
    order: 1,
  },
  {
    code: 'INKA_256',
    name: 'Inca Kola mediana 256 ml',
    description: 'Presentación mediana',
    category: 'BEBIDAS',
    brand: 'Inca Kola',
    presentation: 'Mediana',
    content: 256,
    unit: 'ML',
    price: 200,
    order: 2,
  },
  {
    code: 'INKA_600',
    name: 'Inca Kola 600 ml',
    description: 'Botella de 600 ml',
    category: 'BEBIDAS',
    brand: 'Inca Kola',
    presentation: '600 ml',
    content: 600,
    unit: 'ML',
    price: 350,
    order: 3,
  },
  {
    code: 'INKA_1000',
    name: 'Inca Kola 1 L',
    description: 'Botella de 1 litro',
    category: 'BEBIDAS',
    brand: 'Inca Kola',
    presentation: '1 L',
    content: 1000,
    unit: 'ML',
    price: 600,
    order: 4,
  },
  {
    code: 'INKA_1500',
    name: 'Inca Kola 1.5 L',
    description: 'Botella de 1.5 litros',
    category: 'BEBIDAS',
    brand: 'Inca Kola',
    presentation: '1.5 L',
    content: 1500,
    unit: 'ML',
    price: 700,
    order: 5,
  },
  {
    code: 'COCA_192',
    name: 'Coca-Cola personal 192 ml',
    description: 'Presentación personal',
    category: 'BEBIDAS',
    brand: 'Coca-Cola',
    presentation: 'Personal',
    content: 192,
    unit: 'ML',
    price: 150,
    order: 6,
  },
  {
    code: 'COCA_256',
    name: 'Coca-Cola mediana 256 ml',
    description: 'Presentación mediana',
    category: 'BEBIDAS',
    brand: 'Coca-Cola',
    presentation: 'Mediana',
    content: 256,
    unit: 'ML',
    price: 200,
    order: 7,
  },
  {
    code: 'COCA_600',
    name: 'Coca-Cola 600 ml',
    description: 'Botella de 600 ml',
    category: 'BEBIDAS',
    brand: 'Coca-Cola',
    presentation: '600 ml',
    content: 600,
    unit: 'ML',
    price: 350,
    order: 8,
  },
  {
    code: 'COCA_1000',
    name: 'Coca-Cola 1 L',
    description: 'Botella de 1 litro',
    category: 'BEBIDAS',
    brand: 'Coca-Cola',
    presentation: '1 L',
    content: 1000,
    unit: 'ML',
    price: 600,
    order: 9,
  },
  {
    code: 'COCA_1500',
    name: 'Coca-Cola 1.5 L',
    description: 'Botella de 1.5 litros',
    category: 'BEBIDAS',
    brand: 'Coca-Cola',
    presentation: '1.5 L',
    content: 1500,
    unit: 'ML',
    price: 700,
    order: 10,
  },
  {
    code: 'FANTA_192',
    name: 'Fanta personal 192 ml',
    description: 'Presentación personal',
    category: 'BEBIDAS',
    brand: 'Fanta',
    presentation: 'Personal',
    content: 192,
    unit: 'ML',
    price: 150,
    order: 11,
  },
  {
    code: 'FANTA_256',
    name: 'Fanta mediana 256 ml',
    description: 'Presentación mediana',
    category: 'BEBIDAS',
    brand: 'Fanta',
    presentation: 'Mediana',
    content: 256,
    unit: 'ML',
    price: 200,
    order: 12,
  },
  {
    code: 'ESCOCESA_400',
    name: 'Escocesa 400 ml',
    description: 'Presentación de 400 ml',
    category: 'BEBIDAS',
    brand: 'Escocesa',
    presentation: '400 ml',
    content: 400,
    unit: 'ML',
    price: 400,
    order: 13,
  },
  {
    code: 'ESCOCESA_600',
    name: 'Escocesa 600 ml',
    description: 'Presentación de 600 ml',
    category: 'BEBIDAS',
    brand: 'Escocesa',
    presentation: '600 ml',
    content: 600,
    unit: 'ML',
    price: 500,
    order: 14,
  },
  {
    code: 'MATE_TAZA',
    name: 'Mate caliente',
    description: 'Taza de mate caliente',
    category: 'BEBIDAS',
    presentation: 'Taza',
    unit: 'TAZA',
    price: 100,
    order: 15,
  },
  {
    code: 'PAPA_ADICIONAL_1',
    name: 'Papa adicional S/1',
    description: 'Porción adicional de papa',
    category: 'ADICIONALES',
    presentation: 'S/1',
    unit: 'PORCION',
    price: 100,
    addon: true,
    order: 1,
  },
  {
    code: 'PAPA_ADICIONAL_2',
    name: 'Papa adicional S/2',
    description: 'Porción adicional de papa',
    category: 'ADICIONALES',
    presentation: 'S/2',
    unit: 'PORCION',
    price: 200,
    addon: true,
    order: 2,
  },
  {
    code: 'MURALLA_ADICIONAL_1',
    name: 'Muralla / Chuño blanco S/1',
    description: 'Nombre provisional',
    category: 'ADICIONALES',
    presentation: 'S/1',
    unit: 'PORCION',
    price: 100,
    addon: true,
    order: 3,
  },
  {
    code: 'MURALLA_ADICIONAL_2',
    name: 'Muralla / Chuño blanco S/2',
    description: 'Nombre provisional',
    category: 'ADICIONALES',
    presentation: 'S/2',
    unit: 'PORCION',
    price: 200,
    addon: true,
    order: 4,
  },
  {
    code: 'MURALLA_ADICIONAL_3',
    name: 'Muralla / Chuño blanco S/3',
    description: 'Nombre provisional',
    category: 'ADICIONALES',
    presentation: 'S/3',
    unit: 'PORCION',
    price: 300,
    addon: true,
    order: 5,
  },
];

const MIGRATION_V3_SEED_STATEMENTS: readonly string[] = [
  seedCategory(CATEGORY_IDS.KANKACHO, 'KANKACHO', 'Kankacho', 1),
  seedCategory(CATEGORY_IDS.BEBIDAS, 'BEBIDAS', 'Bebidas', 2),
  seedCategory(CATEGORY_IDS.ADICIONALES, 'ADICIONALES', 'Adicionales', 3),
  ...INITIAL_PRODUCTS.map((product, index) => seedProduct(product, index)),
];

const MIGRATION_V3_CONTROL_STATEMENT = `INSERT OR IGNORE INTO schema_version (
    version, nombre, checksum, aplicada_en_utc, duracion_ms
  ) VALUES (3, 'catalog_and_two_table_accounts', '${MIGRATION_V3_CHECKSUM}',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0);`;

export const MIGRATION_V3 = {
  toVersion: 3,
  statements: [
    ...MIGRATION_V3_SCHEMA_STATEMENTS,
    ...MIGRATION_V3_SEED_STATEMENTS,
    MIGRATION_V3_CONTROL_STATEMENT,
  ],
} as const satisfies capSQLiteVersionUpgrade;

function seedCategory(id: string, code: string, name: string, order: number): string {
  return `INSERT OR IGNORE INTO categorias (
    id, codigo, nombre, nombre_normalizado, orden, activo, creado_en_utc, actualizado_en_utc
  ) VALUES ('${id}', '${code}', '${name}', '${name.toLocaleLowerCase('es-PE')}', ${order}, 1,
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`;
}

function seedProduct(product: SeedProduct, index: number): string {
  const id = `00000000-0000-7000-8000-${String(200 + index).padStart(12, '0')}`;
  return `INSERT OR IGNORE INTO productos (
    id, categoria_id, codigo, nombre, nombre_normalizado, descripcion, marca,
    presentacion, contenido_cantidad, unidad_medida, tipo_envase, precio_centimos,
    es_adicional, disponibilidad, activo, permite_adicionales, permite_modificar_precio,
    orden, creado_en_utc, actualizado_en_utc, actualizado_por_usuario_id
  ) VALUES (
    '${id}', '${CATEGORY_IDS[product.category]}', '${sql(product.code)}', '${sql(product.name)}',
    '${sql(product.name.normalize('NFKC').toLocaleLowerCase('es-PE'))}', '${sql(product.description)}',
    ${nullableText(product.brand)}, '${sql(product.presentation)}', ${product.content ?? 'NULL'},
    '${product.unit}', NULL, ${product.price}, ${product.addon ? 1 : 0}, 'DISPONIBLE', 1,
    ${product.allowsAddons ? 1 : 0}, ${product.allowsPriceChange ? 1 : 0}, ${product.order},
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL
  );`;
}

function nullableText(value: string | undefined): string {
  return value === undefined ? 'NULL' : `'${sql(value)}'`;
}

function sql(value: string): string {
  return value.replaceAll("'", "''");
}
