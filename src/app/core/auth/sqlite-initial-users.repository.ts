import type {
  InitialUserProvisioning,
  InitialUsersRepository,
  NewUserRecord,
} from '../../domain/auth/provision-initial-users.use-case';
import { InitialUsersAlreadyExistError } from '../../domain/auth/provision-initial-users.use-case';
import type { UserRole } from '../../domain/auth/authorization-policy';

export const INITIAL_USERS_REPOSITORY = new InjectionToken<InitialUsersRepository>(
  'INITIAL_USERS_REPOSITORY',
);

export type SqliteAuthValue = string | number | bigint | null | Uint8Array;
export type SqliteAuthRow = Readonly<Record<string, SqliteAuthValue>>;

export interface SqliteAuthDatabase {
  query(statement: string, values?: readonly SqliteAuthValue[]): Promise<readonly SqliteAuthRow[]>;
  run(statement: string, values?: readonly SqliteAuthValue[]): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

export class RequiredInitialRoleMissingError extends Error {
  readonly code = 'REQUIRED_INITIAL_ROLE_MISSING';

  constructor() {
    super('No se encontraron los roles iniciales requeridos.');
    this.name = 'RequiredInitialRoleMissingError';
  }
}

export class SqliteInitialUsersRepository implements InitialUsersRepository {
  constructor(private readonly database: SqliteAuthDatabase) {}

  async hasAnyUsers(): Promise<boolean> {
    const rows = await this.database.query('SELECT 1 AS found FROM usuarios LIMIT 1;');
    return rows.length > 0;
  }

  async provision(provisioning: InitialUserProvisioning): Promise<void> {
    await this.database.beginTransaction();

    try {
      if (await this.hasAnyUsers()) {
        throw new InitialUsersAlreadyExistError();
      }

      const roleIds = await this.loadRequiredRoleIds();

      for (const user of provisioning.users) {
        await this.insertUser(user, roleIds[user.role]);
      }

      await this.database.run(
        `INSERT INTO credenciales_recuperacion (
           id, usuario_id, codigo_hash, codigo_sal, codigo_algoritmo, creado_en_utc
         ) VALUES (?, ?, ?, ?, ?, ?);`,
        [
          provisioning.recoveryCredential.id,
          provisioning.recoveryCredential.userId,
          provisioning.recoveryCredential.codeHash,
          provisioning.recoveryCredential.codeSalt,
          provisioning.recoveryCredential.codeAlgorithm,
          provisioning.recoveryCredential.createdAtUtc,
        ],
      );

      for (const auditRecord of provisioning.auditRecords) {
        await this.database.run(
          `INSERT INTO auditoria (
             id, usuario_id, jornada_id, accion, entidad_tipo, entidad_id,
             valores_anteriores_json, valores_nuevos_json, motivo, ocurrido_en_utc
           ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, NULL, ?);`,
          [
            auditRecord.id,
            auditRecord.actorUserId,
            auditRecord.action,
            auditRecord.entityType,
            auditRecord.entityId,
            JSON.stringify(auditRecord.newValues),
            auditRecord.occurredAtUtc,
          ],
        );
      }

      await this.database.commitTransaction();
    } catch (error: unknown) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private async loadRequiredRoleIds(): Promise<Record<UserRole, string>> {
    const rows = await this.database.query(
      `SELECT id, codigo
         FROM roles
        WHERE codigo IN ('ADMINISTRADOR', 'CAJERO') AND activo = 1;`,
    );
    const roleIds = new Map<string, string>();

    for (const row of rows) {
      if (typeof row['codigo'] === 'string' && typeof row['id'] === 'string') {
        roleIds.set(row['codigo'], row['id']);
      }
    }

    const administratorRoleId = roleIds.get('ADMINISTRADOR');
    const cashierRoleId = roleIds.get('CAJERO');

    if (administratorRoleId === undefined || cashierRoleId === undefined) {
      throw new RequiredInitialRoleMissingError();
    }

    return {
      ADMINISTRADOR: administratorRoleId,
      CAJERO: cashierRoleId,
    };
  }

  private insertUser(user: NewUserRecord, roleId: string): Promise<void> {
    return this.database.run(
      `INSERT INTO usuarios (
         id, rol_id, nombre_usuario, nombre_usuario_normalizado, nombre_mostrar,
         contrasena_hash, contrasena_sal, contrasena_algoritmo, activo,
         creado_en_utc, actualizado_en_utc
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        user.id,
        roleId,
        user.username,
        user.normalizedUsername,
        user.displayName,
        user.passwordHash,
        user.passwordSalt,
        user.passwordAlgorithm,
        user.active ? 1 : 0,
        user.createdAtUtc,
        user.updatedAtUtc,
      ],
    );
  }
}
import { InjectionToken } from '@angular/core';
