import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import {
  MIGRATION_V3,
  MIGRATION_V3_CHECKSUM,
  MIGRATION_V3_SCHEMA_STATEMENTS,
} from '../../src/app/core/database/migrations/migration-v3';

const NOW = '2026-07-29T22:00:00.000Z';

describe('migration v3', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    for (const statement of MIGRATION_V3.statements) database.exec(statement);
  });

  afterEach(() => database.close());

  it('seeds the three categories and only the 23 confirmed products', () => {
    expect(database.prepare('SELECT codigo FROM categorias ORDER BY orden').all()).toEqual([
      { codigo: 'KANKACHO' },
      { codigo: 'BEBIDAS' },
      { codigo: 'ADICIONALES' },
    ]);
    expect(database.prepare('SELECT COUNT(*) AS total FROM productos').get()).toEqual({
      total: 23,
    });
    expect(
      database.prepare("SELECT COUNT(*) AS total FROM productos WHERE nombre LIKE '%2 L%'").get(),
    ).toEqual({ total: 0 });
  });

  it('stores presentation fields and grants line-price changes only to kankacho', () => {
    expect(
      database
        .prepare(
          `SELECT descripcion, presentacion, contenido_cantidad, unidad_medida,
                  permite_adicionales, permite_modificar_precio, disponibilidad
             FROM productos WHERE codigo = 'KANKACHO_20'`,
        )
        .get(),
    ).toEqual({
      descripcion: 'Porción normal',
      presentacion: 'Normal',
      contenido_cantidad: null,
      unidad_medida: 'PORCION',
      permite_adicionales: 1,
      permite_modificar_precio: 1,
      disponibilidad: 'DISPONIBLE',
    });
    expect(
      database
        .prepare(
          `SELECT marca, contenido_cantidad, unidad_medida, permite_adicionales,
                  permite_modificar_precio FROM productos WHERE codigo = 'INKA_600'`,
        )
        .get(),
    ).toEqual({
      marca: 'Inca Kola',
      contenido_cantidad: 600,
      unidad_medida: 'ML',
      permite_adicionales: 0,
      permite_modificar_precio: 0,
    });
  });

  it('keeps product image history and permits only one current image', () => {
    const productId = String(
      (
        database.prepare("SELECT id FROM productos WHERE codigo = 'KANKACHO_20'").get() as {
          id: string;
        }
      ).id,
    );
    insertImage(database, 'image-1', productId);
    expect(() => insertImage(database, 'image-2', productId)).toThrow();
    database
      .prepare('UPDATE producto_imagenes SET activa = 0, retirada_en_utc = ? WHERE id = ?')
      .run(NOW, 'image-1');
    expect(() => insertImage(database, 'image-2', productId)).not.toThrow();
    expect(database.prepare('SELECT COUNT(*) AS total FROM producto_imagenes').get()).toEqual({
      total: 2,
    });
  });

  it('removes the old one-account index so a table can link to two accounts', () => {
    seedTwoAccountFixture(database);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'ux_operacion_mesas_mesa_activa'",
        )
        .get(),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS total FROM operacion_mesas WHERE mesa_id = 'table-1' AND liberada_en_utc IS NULL",
        )
        .get(),
    ).toEqual({ total: 2 });
  });

  it('blocks a third active account and permits it after one account releases the table', () => {
    seedTwoAccountFixture(database);
    insertOperation(database, 'c');

    expect(() => insertTableLink(database, 'c')).toThrow(/TABLE_ACTIVE_ACCOUNT_LIMIT/);

    database
      .prepare(
        `UPDATE operacion_mesas
      SET liberada_por_usuario_id = 'user-cashier', liberada_en_utc = ?
      WHERE id = 'link-a';`,
      )
      .run(NOW);

    expect(() => insertTableLink(database, 'c')).not.toThrow();
  });

  it('records the reproducible catalog migration checksum', () => {
    const checksum = createHash('sha256')
      .update(MIGRATION_V3_SCHEMA_STATEMENTS.join('\n'))
      .digest('hex');
    expect(checksum).toBe(MIGRATION_V3_CHECKSUM);
    expect(
      database
        .prepare('SELECT version, nombre, checksum FROM schema_version WHERE version = 3')
        .get(),
    ).toEqual({
      version: 3,
      nombre: 'catalog_and_two_table_accounts',
      checksum: MIGRATION_V3_CHECKSUM,
    });
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

function insertImage(database: DatabaseSync, id: string, productId: string): void {
  database
    .prepare(
      `INSERT INTO producto_imagenes (
    id, producto_id, ruta_local, tipo_mime, ancho_px, alto_px, tamano_bytes,
    checksum_sha256, activa, creada_en_utc
  ) VALUES (?, ?, ?, 'image/webp', 512, 512, 20000, ?, 1, ?);`,
    )
    .run(id, productId, `images/${id}.webp`, id.padEnd(64, '0'), NOW);
}

function seedTwoAccountFixture(database: DatabaseSync): void {
  const roleId = String(
    (database.prepare("SELECT id FROM roles WHERE codigo = 'CAJERO'").get() as { id: string }).id,
  );
  database
    .prepare(
      `INSERT INTO usuarios (
    id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
    contrasena_hash, contrasena_sal, contrasena_algoritmo, activo, creado_en_utc, actualizado_en_utc
  ) VALUES ('user-cashier', ?, 'Caja', 'caja', 'Caja', 'hash', 'salt', 'fixture', 1, ?, ?);`,
    )
    .run(roleId, NOW, NOW);
  database
    .prepare(
      `INSERT INTO jornadas_caja (
    id, fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
    abierta_en_utc, clave_idempotencia, version
  ) VALUES ('journey-1', '2026-07-29', 'ABIERTA', 0, 'user-cashier', ?, 'journey-key', 1);`,
    )
    .run(NOW);
  database
    .prepare(
      `INSERT INTO mesas (id, codigo, nombre, orden, activo, creado_en_utc, actualizado_en_utc)
    VALUES ('table-1', 'MESA_1', 'Mesa 1', 1, 1, ?, ?);`,
    )
    .run(NOW, NOW);
  for (const suffix of ['a', 'b']) insertOperationAndTableLink(database, suffix);
}

function insertOperationAndTableLink(database: DatabaseSync, suffix: string): void {
  insertOperation(database, suffix);
  insertTableLink(database, suffix);
}

function insertOperation(database: DatabaseSync, suffix: string): void {
  database
    .prepare(
      `INSERT INTO operaciones (
      id, codigo, tipo, estado, jornada_creacion_id, creada_por_usuario_id, creada_en_utc,
      subtotal_catalogo_centimos, descuento_total_centimos, total_centimos,
      pagado_centimos, saldo_centimos, clave_idempotencia, version
    ) VALUES (?, ?, 'CUENTA_MESA', 'ABIERTA', 'journey-1', 'user-cashier', ?, 0, 0, 0, 0, 0, ?, 1);`,
    )
    .run(`operation-${suffix}`, `CUENTA-${suffix.toUpperCase()}`, NOW, `operation-key-${suffix}`);
}

function insertTableLink(database: DatabaseSync, suffix: string): void {
  database
    .prepare(
      `INSERT INTO operacion_mesas (
      id, operacion_id, mesa_id, rol_mesa, vinculada_por_usuario_id, vinculada_en_utc
    ) VALUES (?, ?, 'table-1', 'PRINCIPAL', 'user-cashier', ?);`,
    )
    .run(`link-${suffix}`, `operation-${suffix}`, NOW);
}
