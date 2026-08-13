import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';

export const MIGRATION_V5_CHECKSUM =
  '68f1156c46d80f8107166489658e2b4ba4fc51acc9589d79197af02131e99320';

export const MIGRATION_V5_WORK_STATEMENTS: readonly string[] = [
  `ALTER TABLE categorias_gasto ADD COLUMN orden INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0);`,
  `UPDATE categorias_gasto SET orden = CASE codigo
     WHEN 'INSUMOS' THEN 1
     WHEN 'BEBIDAS' THEN 2
     WHEN 'SERVICIOS' THEN 3
     WHEN 'TRANSPORTE' THEN 4
     WHEN 'MANTENIMIENTO' THEN 5
     WHEN 'PERDIDA_CONSUMO_NO_COBRADO' THEN 6
     WHEN 'OTROS' THEN 7
     ELSE orden
   END;`,
  `CREATE INDEX IF NOT EXISTS idx_categorias_gasto_listado
     ON categorias_gasto (activo, orden, nombre_normalizado);`,
];

const MIGRATION_V5_CONTROL_STATEMENT = `INSERT OR IGNORE INTO schema_version (
    version, nombre, checksum, aplicada_en_utc, duracion_ms
  ) VALUES (5, 'expense_category_order', '${MIGRATION_V5_CHECKSUM}',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0);`;

export const MIGRATION_V5 = {
  toVersion: 5,
  statements: [...MIGRATION_V5_WORK_STATEMENTS, MIGRATION_V5_CONTROL_STATEMENT],
} as const satisfies capSQLiteVersionUpgrade;
