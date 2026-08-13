import { InjectionToken } from '@angular/core';

import type {
  AdministratorRecoveryRepository,
  AdministratorRecoveryReplacement,
  AdministratorRecoveryRecord,
} from '../../domain/auth/recover-administrator-access.use-case';
import type { SqliteAuthDatabase } from './sqlite-initial-users.repository';

export const ADMINISTRATOR_RECOVERY_REPOSITORY =
  new InjectionToken<AdministratorRecoveryRepository>('ADMINISTRATOR_RECOVERY_REPOSITORY');

export class SqliteAdministratorRecoveryRepository implements AdministratorRecoveryRepository {
  constructor(private readonly database: SqliteAuthDatabase) {}

  async findActiveAdministratorRecovery(): Promise<AdministratorRecoveryRecord | null> {
    const rows = await this.database.query(
      `SELECT cr.id AS recovery_id, cr.usuario_id, cr.codigo_hash,
              cr.codigo_sal, cr.codigo_algoritmo
         FROM credenciales_recuperacion cr
         JOIN usuarios u ON u.id = cr.usuario_id
         JOIN roles r ON r.id = u.rol_id
        WHERE r.codigo = 'ADMINISTRADOR' AND u.activo = 1
          AND cr.usado_en_utc IS NULL AND cr.revocado_en_utc IS NULL
        LIMIT 1;`,
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      recoveryId: requireString(row['recovery_id']),
      userId: requireString(row['usuario_id']),
      credential: {
        hash: requireString(row['codigo_hash']),
        salt: requireString(row['codigo_sal']),
        algorithm: requireString(row['codigo_algoritmo']),
      },
    };
  }

  async replacePasswordAndRecovery(replacement: AdministratorRecoveryReplacement): Promise<void> {
    await this.database.beginTransaction();
    try {
      await this.database.run(
        `UPDATE credenciales_recuperacion SET usado_en_utc = ?
          WHERE id = ? AND usuario_id = ? AND usado_en_utc IS NULL AND revocado_en_utc IS NULL;`,
        [replacement.occurredAtUtc, replacement.previousRecoveryId, replacement.userId],
      );
      await this.database.run(
        `UPDATE usuarios SET contrasena_hash = ?, contrasena_sal = ?, contrasena_algoritmo = ?,
            intentos_fallidos = 0, bloqueado_hasta_utc = NULL, ultimo_fallo_en_utc = NULL,
            actualizado_en_utc = ? WHERE id = ?;`,
        [
          replacement.passwordCredential.hash,
          replacement.passwordCredential.salt,
          replacement.passwordCredential.algorithm,
          replacement.occurredAtUtc,
          replacement.userId,
        ],
      );
      await this.database.run(
        `INSERT INTO credenciales_recuperacion (
           id, usuario_id, codigo_hash, codigo_sal, codigo_algoritmo, creado_en_utc
         ) VALUES (?, ?, ?, ?, ?, ?);`,
        [
          replacement.newRecoveryId,
          replacement.userId,
          replacement.recoveryCredential.hash,
          replacement.recoveryCredential.salt,
          replacement.recoveryCredential.algorithm,
          replacement.occurredAtUtc,
        ],
      );
      await this.database.run(
        `INSERT INTO auditoria (
           id, usuario_id, jornada_id, accion, entidad_tipo, entidad_id,
           valores_anteriores_json, valores_nuevos_json, motivo, ocurrido_en_utc
         ) VALUES (?, ?, NULL, 'RECUPERAR_ACCESO_ADMINISTRADOR', 'USUARIO', ?,
                   NULL, '{"codigo_recuperacion_renovado":true}', NULL, ?);`,
        [replacement.auditId, replacement.userId, replacement.userId, replacement.occurredAtUtc],
      );
      await this.database.commitTransaction();
    } catch (error: unknown) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('La credencial de recuperación no es válida.');
  return value;
}
