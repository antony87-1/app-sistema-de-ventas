import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';

export const MIGRATION_V4_CHECKSUM =
  'd194f64b94bc96eb6d08805c70560b9fd82b9b55056456dc08f302cc2e75ebc8';

const EXPENSE_CATEGORIES = [
  ['00000000-0000-7000-8000-000000000300', 'INSUMOS', 'Compra de insumos'],
  ['00000000-0000-7000-8000-000000000301', 'BEBIDAS', 'Compra de bebidas'],
  ['00000000-0000-7000-8000-000000000302', 'SERVICIOS', 'Servicios'],
  ['00000000-0000-7000-8000-000000000303', 'TRANSPORTE', 'Transporte'],
  ['00000000-0000-7000-8000-000000000304', 'MANTENIMIENTO', 'Mantenimiento'],
  [
    '00000000-0000-7000-8000-000000000305',
    'PERDIDA_CONSUMO_NO_COBRADO',
    'Pérdida o consumo no cobrado',
  ],
  ['00000000-0000-7000-8000-000000000306', 'OTROS', 'Otros'],
] as const;

export const MIGRATION_V4_DATA_STATEMENTS: readonly string[] = EXPENSE_CATEGORIES.map(
  ([id, code, name]) =>
    `INSERT OR IGNORE INTO categorias_gasto (
       id, codigo, nombre, nombre_normalizado, activo, creado_en_utc, actualizado_en_utc
     ) VALUES (
       '${id}', '${code}', '${sql(name)}', '${sql(normalize(name))}', 1,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     );`,
);

const MIGRATION_V4_CONTROL_STATEMENT = `INSERT OR IGNORE INTO schema_version (
    version, nombre, checksum, aplicada_en_utc, duracion_ms
  ) VALUES (4, 'expense_categories', '${MIGRATION_V4_CHECKSUM}',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0);`;

export const MIGRATION_V4 = {
  toVersion: 4,
  statements: [...MIGRATION_V4_DATA_STATEMENTS, MIGRATION_V4_CONTROL_STATEMENT],
} as const satisfies capSQLiteVersionUpgrade;

function normalize(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('es-PE');
}

function sql(value: string): string {
  return value.replaceAll("'", "''");
}
