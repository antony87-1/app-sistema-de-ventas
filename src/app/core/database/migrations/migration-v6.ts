import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';

export const MIGRATION_V6_CHECKSUM =
  '8e4c59586f9065430923e51b810196e9b14358bbf0d705b6513d2032047faec6';
export const MIGRATION_V6_WORK_STATEMENTS: readonly string[] = [
  `ALTER TABLE pedido_programado_datos ADD COLUMN jornada_entrega_id TEXT REFERENCES jornadas_caja(id) ON UPDATE RESTRICT ON DELETE RESTRICT;`,
  `CREATE INDEX IF NOT EXISTS idx_pedido_programado_jornada_entrega ON pedido_programado_datos (jornada_entrega_id, entregado_en_utc);`,
];
const CONTROL = `INSERT OR IGNORE INTO schema_version (version,nombre,checksum,aplicada_en_utc,duracion_ms)
VALUES (6,'scheduled_order_delivery_journey','${MIGRATION_V6_CHECKSUM}',strftime('%Y-%m-%dT%H:%M:%fZ','now'),0);`;
export const MIGRATION_V6 = {
  toVersion: 6,
  statements: [...MIGRATION_V6_WORK_STATEMENTS, CONTROL],
} as const satisfies capSQLiteVersionUpgrade;
