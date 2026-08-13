import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';

export const MIGRATION_V2_CHECKSUM =
  '4ba57c28f3c69733e512dae144a1c1fc0452ba69399ec731f25c1552e82d99d9';

export const MIGRATION_V2_SCHEMA_STATEMENTS: readonly string[] = [
  `ALTER TABLE usuarios
     ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0
     CHECK (intentos_fallidos >= 0 AND intentos_fallidos < 5);`,
  `ALTER TABLE usuarios
     ADD COLUMN bloqueado_hasta_utc TEXT
     CHECK (bloqueado_hasta_utc IS NULL OR length(trim(bloqueado_hasta_utc)) > 0);`,
  `ALTER TABLE usuarios
     ADD COLUMN ultimo_fallo_en_utc TEXT
     CHECK (ultimo_fallo_en_utc IS NULL OR length(trim(ultimo_fallo_en_utc)) > 0);`,
  `CREATE TABLE IF NOT EXISTS credenciales_recuperacion (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    usuario_id TEXT NOT NULL,
    codigo_hash TEXT NOT NULL CHECK (length(trim(codigo_hash)) > 0),
    codigo_sal TEXT NOT NULL CHECK (length(trim(codigo_sal)) > 0),
    codigo_algoritmo TEXT NOT NULL CHECK (length(trim(codigo_algoritmo)) > 0),
    creado_en_utc TEXT NOT NULL CHECK (length(trim(creado_en_utc)) > 0),
    usado_en_utc TEXT CHECK (usado_en_utc IS NULL OR length(trim(usado_en_utc)) > 0),
    revocado_en_utc TEXT CHECK (revocado_en_utc IS NULL OR length(trim(revocado_en_utc)) > 0),
    CHECK (usado_en_utc IS NULL OR revocado_en_utc IS NULL),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_usuarios_bloqueo
     ON usuarios (bloqueado_hasta_utc) WHERE bloqueado_hasta_utc IS NOT NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_recuperacion_activa_usuario
     ON credenciales_recuperacion (usuario_id)
     WHERE usado_en_utc IS NULL AND revocado_en_utc IS NULL;`,
];

const MIGRATION_V2_CONTROL_STATEMENT = `INSERT OR IGNORE INTO schema_version (
    version, nombre, checksum, aplicada_en_utc, duracion_ms
  ) VALUES (
    2, 'authentication_security', '${MIGRATION_V2_CHECKSUM}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0
  );`;

export const MIGRATION_V2 = {
  toVersion: 2,
  statements: [...MIGRATION_V2_SCHEMA_STATEMENTS, MIGRATION_V2_CONTROL_STATEMENT],
} as const satisfies capSQLiteVersionUpgrade;
