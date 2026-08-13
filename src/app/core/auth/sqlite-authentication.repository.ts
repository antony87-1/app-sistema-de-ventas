import { InjectionToken } from '@angular/core';

import type {
  AuthenticationRepository,
  AuthenticationUser,
} from '../../domain/auth/authenticate-user.use-case';
import type { UserRole } from '../../domain/auth/authorization-policy';
import type { SqliteAuthDatabase, SqliteAuthRow } from './sqlite-initial-users.repository';

export const AUTHENTICATION_REPOSITORY = new InjectionToken<AuthenticationRepository>(
  'AUTHENTICATION_REPOSITORY',
);

export class SqliteAuthenticationRepository implements AuthenticationRepository {
  constructor(private readonly database: SqliteAuthDatabase) {}

  async findByNormalizedUsername(normalizedUsername: string): Promise<AuthenticationUser | null> {
    const rows = await this.database.query(
      `SELECT u.id, r.codigo AS rol, u.nombre_mostrar, u.contrasena_hash,
              u.contrasena_sal, u.contrasena_algoritmo, u.activo,
              u.intentos_fallidos, u.bloqueado_hasta_utc
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
        WHERE u.nombre_usuario_normalizado = ?
        LIMIT 1;`,
      [normalizedUsername],
    );
    return rows.length === 0 ? null : mapAuthenticationUser(rows[0]);
  }

  async recordFailedAttempt(
    userId: string,
    attempts: number,
    blockedUntilUtc: string | null,
    occurredAtUtc: string,
  ): Promise<void> {
    await this.database.run(
      `UPDATE usuarios
          SET intentos_fallidos = ?, bloqueado_hasta_utc = ?,
              ultimo_fallo_en_utc = ?, actualizado_en_utc = ?
        WHERE id = ?;`,
      [attempts, blockedUntilUtc, occurredAtUtc, occurredAtUtc, userId],
    );
  }

  async recordSuccessfulLogin(
    userId: string,
    auditId: string,
    occurredAtUtc: string,
  ): Promise<void> {
    await this.database.beginTransaction();
    try {
      await this.database.run(
        `UPDATE usuarios
            SET intentos_fallidos = 0, bloqueado_hasta_utc = NULL,
                ultimo_fallo_en_utc = NULL, actualizado_en_utc = ?
          WHERE id = ?;`,
        [occurredAtUtc, userId],
      );
      await this.database.run(
        `INSERT INTO auditoria (
           id, usuario_id, jornada_id, accion, entidad_tipo, entidad_id,
           valores_anteriores_json, valores_nuevos_json, motivo, ocurrido_en_utc
         ) VALUES (?, ?, NULL, 'INICIAR_SESION', 'USUARIO', ?, NULL, NULL, NULL, ?);`,
        [auditId, userId, userId, occurredAtUtc],
      );
      await this.database.commitTransaction();
    } catch (error: unknown) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
}

function mapAuthenticationUser(row: SqliteAuthRow): AuthenticationUser {
  const role = requireRole(row['rol']);
  return {
    id: requireString(row, 'id'),
    role,
    displayName: requireString(row, 'nombre_mostrar'),
    active: row['activo'] === 1,
    credential: {
      hash: requireString(row, 'contrasena_hash'),
      salt: requireString(row, 'contrasena_sal'),
      algorithm: requireString(row, 'contrasena_algoritmo'),
    },
    failedAttempts: requireNumber(row, 'intentos_fallidos'),
    blockedUntilUtc:
      typeof row['bloqueado_hasta_utc'] === 'string' ? row['bloqueado_hasta_utc'] : null,
  };
}

function requireRole(value: unknown): UserRole {
  if (value === 'ADMINISTRADOR' || value === 'CAJERO') return value;
  throw new Error('La cuenta tiene un rol no reconocido.');
}

function requireString(row: SqliteAuthRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`El campo ${key} no es válido.`);
  return value;
}

function requireNumber(row: SqliteAuthRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number') throw new Error(`El campo ${key} no es válido.`);
  return value;
}
