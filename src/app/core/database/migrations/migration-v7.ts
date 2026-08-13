import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';

export const CUSTOM_SCHEDULED_PRODUCT_ID = '00000000-0000-7000-8000-000000000299';
const CUSTOM_CATEGORY_ID = '00000000-0000-7000-8000-000000000199';
export const MIGRATION_V7_CHECKSUM =
  'd5f18a5e6774102abb2be4f2de763f3554180e7d6aa4968f4e4eb51ecc7caeb3';

export const MIGRATION_V7_WORK_STATEMENTS: readonly string[] = [
  `INSERT OR IGNORE INTO categorias (id,codigo,nombre,nombre_normalizado,orden,activo,creado_en_utc,actualizado_en_utc)
   VALUES ('${CUSTOM_CATEGORY_ID}','SISTEMA_PEDIDOS','Pedido personalizado','pedido personalizado',999,1,
           strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));`,
  `INSERT OR IGNORE INTO productos (
     id,categoria_id,codigo,nombre,nombre_normalizado,descripcion,presentacion,unidad_medida,
     precio_centimos,es_adicional,disponibilidad,activo,permite_adicionales,
     permite_modificar_precio,orden,creado_en_utc,actualizado_en_utc)
   VALUES ('${CUSTOM_SCHEDULED_PRODUCT_ID}','${CUSTOM_CATEGORY_ID}','PEDIDO_PERSONALIZADO',
           'Pedido personalizado','pedido personalizado','Línea escrita para pedidos programados',
           'Personalizada','PORCION',0,0,'DISPONIBLE',1,0,1,999,
           strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));`,
];

const CONTROL = `INSERT OR IGNORE INTO schema_version (version,nombre,checksum,aplicada_en_utc,duracion_ms)
VALUES (7,'custom_scheduled_order_lines','${MIGRATION_V7_CHECKSUM}',strftime('%Y-%m-%dT%H:%M:%fZ','now'),0);`;

export const MIGRATION_V7 = {
  toVersion: 7,
  statements: [...MIGRATION_V7_WORK_STATEMENTS, CONTROL],
} as const satisfies capSQLiteVersionUpgrade;
