import type { SQLInputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';

import {
  SqliteProductAvailabilityRepository,
  type CatalogWriteDatabase,
  type CatalogWriteRow,
  type CatalogWriteValue,
} from '../../src/app/core/catalog/sqlite-product-availability.repository';
import { MIGRATION_V1 } from '../../src/app/core/database/migrations/migration-v1';
import { MIGRATION_V2 } from '../../src/app/core/database/migrations/migration-v2';
import { MIGRATION_V3 } from '../../src/app/core/database/migrations/migration-v3';

const NOW = '2026-07-29T23:00:00.000Z';

describe('SqliteProductAvailabilityRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteProductAvailabilityRepository;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3]) {
      for (const statement of migration.statements) database.exec(statement);
    }
    insertCashier(database);
    repository = new SqliteProductAvailabilityRepository(new NodeCatalogWriteDatabase(database));
  });

  afterEach(() => database.close());

  it('changes availability and records the responsible user and audit atomically', async () => {
    const productId = findProductId(database, 'KANKACHO_20');

    await expect(
      repository.change({
        productId,
        availability: 'AGOTADO',
        actorUserId: 'user-cashier',
        auditId: 'audit-availability',
        occurredAtUtc: NOW,
      }),
    ).resolves.toEqual({
      productId,
      previousAvailability: 'DISPONIBLE',
      currentAvailability: 'AGOTADO',
      changed: true,
    });
    expect(
      database
        .prepare(
          `SELECT disponibilidad, actualizado_por_usuario_id, actualizado_en_utc
                    FROM productos WHERE id = ?`,
        )
        .get(productId),
    ).toEqual({
      disponibilidad: 'AGOTADO',
      actualizado_por_usuario_id: 'user-cashier',
      actualizado_en_utc: NOW,
    });
    expect(
      database
        .prepare(
          `SELECT usuario_id, accion, entidad_tipo, entidad_id,
                         valores_anteriores_json, valores_nuevos_json, ocurrido_en_utc
                    FROM auditoria WHERE id = 'audit-availability'`,
        )
        .get(),
    ).toEqual({
      usuario_id: 'user-cashier',
      accion: 'CAMBIAR_DISPONIBILIDAD_PRODUCTO',
      entidad_tipo: 'PRODUCTO',
      entidad_id: productId,
      valores_anteriores_json: JSON.stringify({ disponibilidad: 'DISPONIBLE' }),
      valores_nuevos_json: JSON.stringify({ disponibilidad: 'AGOTADO' }),
      ocurrido_en_utc: NOW,
    });
  });

  it('does not create duplicate audit records when the requested state is already current', async () => {
    const productId = findProductId(database, 'KANKACHO_20');

    await expect(
      repository.change({
        productId,
        availability: 'DISPONIBLE',
        actorUserId: 'user-cashier',
        auditId: 'unused-audit',
        occurredAtUtc: NOW,
      }),
    ).resolves.toMatchObject({ changed: false, previousAvailability: 'DISPONIBLE' });
    expect(database.prepare('SELECT COUNT(*) AS total FROM auditoria').get()).toEqual({ total: 0 });
  });

  it('rejects inactive or missing products without writing an audit record', async () => {
    const productId = findProductId(database, 'KANKACHO_20');
    database.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(productId);

    await expect(
      repository.change({
        productId,
        availability: 'AGOTADO',
        actorUserId: 'user-cashier',
        auditId: 'audit-inactive',
        occurredAtUtc: NOW,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVE_PRODUCT_NOT_FOUND' });
    expect(database.prepare('SELECT COUNT(*) AS total FROM auditoria').get()).toEqual({ total: 0 });
  });

  it('rolls back the product update when the audit insert fails', async () => {
    const productId = findProductId(database, 'KANKACHO_20');
    insertConflictingAudit(database, productId);

    await expect(
      repository.change({
        productId,
        availability: 'AGOTADO',
        actorUserId: 'user-cashier',
        auditId: 'duplicate-audit',
        occurredAtUtc: NOW,
      }),
    ).rejects.toThrow();
    expect(
      database.prepare('SELECT disponibilidad FROM productos WHERE id = ?').get(productId),
    ).toEqual({ disponibilidad: 'DISPONIBLE' });
  });
});

class NodeCatalogWriteDatabase implements CatalogWriteDatabase {
  private transactionActive = false;

  constructor(private readonly database: DatabaseSync) {}

  async query(
    statement: string,
    values: readonly CatalogWriteValue[] = [],
  ): Promise<readonly CatalogWriteRow[]> {
    return this.database
      .prepare(statement)
      .all(...([...values] as SQLInputValue[]))
      .map((row) => ({ ...row }));
  }

  async run(statement: string, values: readonly CatalogWriteValue[] = []): Promise<void> {
    this.database.prepare(statement).run(...([...values] as SQLInputValue[]));
  }

  async beginTransaction(): Promise<void> {
    this.database.exec('BEGIN IMMEDIATE;');
    this.transactionActive = true;
  }

  async commitTransaction(): Promise<void> {
    this.database.exec('COMMIT;');
    this.transactionActive = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (this.transactionActive) this.database.exec('ROLLBACK;');
    this.transactionActive = false;
  }
}

function insertCashier(database: DatabaseSync): void {
  const role = database.prepare("SELECT id FROM roles WHERE codigo = 'CAJERO'").get() as {
    id: string;
  };
  database
    .prepare(
      `INSERT INTO usuarios (
      id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
      contrasena_hash, contrasena_sal, contrasena_algoritmo, activo,
      creado_en_utc, actualizado_en_utc
    ) VALUES ('user-cashier', ?, 'Caja', 'caja', 'Caja', 'hash', 'salt', 'fixture', 1, ?, ?);`,
    )
    .run(role.id, NOW, NOW);
}

function findProductId(database: DatabaseSync, code: string): string {
  return String(
    (database.prepare('SELECT id FROM productos WHERE codigo = ?').get(code) as { id: string }).id,
  );
}

function insertConflictingAudit(database: DatabaseSync, productId: string): void {
  database
    .prepare(
      `INSERT INTO auditoria (
      id, usuario_id, accion, entidad_tipo, entidad_id, ocurrido_en_utc
    ) VALUES ('duplicate-audit', 'user-cashier', 'FIXTURE', 'PRODUCTO', ?, ?);`,
    )
    .run(productId, NOW);
}
