import { InjectionToken } from '@angular/core';

import {
  BusinessDateAlreadyHasJourneyError,
  IdempotencyConflictError,
  JourneyAlreadyOpenError,
  type JourneyOpeningCommand,
  type JourneyOpeningRepository,
} from '../../domain/journey/open-journey.use-case';
import type { OpenJourney } from '../../domain/journey/get-open-journey-status.use-case';

export const JOURNEY_OPENING_REPOSITORY = new InjectionToken<JourneyOpeningRepository>(
  'JOURNEY_OPENING_REPOSITORY',
);

export type JourneyWriteValue = string | number | bigint | null | Uint8Array;
export type JourneyWriteRow = Readonly<Record<string, JourneyWriteValue>>;

export interface JourneyWriteDatabase {
  query(
    statement: string,
    values?: readonly JourneyWriteValue[],
  ): Promise<readonly JourneyWriteRow[]>;
  run(statement: string, values?: readonly JourneyWriteValue[]): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

export class SqliteJourneyOpeningRepository implements JourneyOpeningRepository {
  constructor(private readonly database: JourneyWriteDatabase) {}

  async open(command: JourneyOpeningCommand): Promise<OpenJourney> {
    await this.database.beginTransaction();
    try {
      const idempotentRows = await this.findByIdempotencyKey(command.idempotencyKey);
      if (idempotentRows.length > 0) {
        const row = idempotentRows[0];
        if (!isSameRequest(row, command)) throw new IdempotencyConflictError();
        const journey = mapOpenJourney(row);
        await this.database.commitTransaction();
        return journey;
      }

      const openRows = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado = 'ABIERTA' LIMIT 1;`,
      );
      if (openRows.length > 0) throw new JourneyAlreadyOpenError();

      const sameDateRows = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE fecha_negocio = ? LIMIT 1;`,
        [command.businessDate],
      );
      if (sameDateRows.length > 0) throw new BusinessDateAlreadyHasJourneyError();

      await this.database.run(
        `INSERT INTO jornadas_caja (
           id, fecha_negocio, estado, monto_inicial_centimos, abierta_por_usuario_id,
           abierta_en_utc, observacion_apertura, clave_idempotencia, version
         ) VALUES (?, ?, 'ABIERTA', ?, ?, ?, ?, ?, 1);`,
        [
          command.journeyId,
          command.businessDate,
          command.initialAmountCents,
          command.actorUserId,
          command.openedAtUtc,
          command.observation,
          command.idempotencyKey,
        ],
      );

      await this.database.run(
        `INSERT INTO auditoria (
           id, usuario_id, jornada_id, accion, entidad_tipo, entidad_id,
           valores_anteriores_json, valores_nuevos_json, motivo, ocurrido_en_utc
         ) VALUES (?, ?, ?, 'ABRIR_JORNADA', 'JORNADA_CAJA', ?, NULL, ?, NULL, ?);`,
        [
          command.auditId,
          command.actorUserId,
          command.journeyId,
          command.journeyId,
          JSON.stringify({
            fecha_negocio: command.businessDate,
            estado: 'ABIERTA',
            monto_inicial_centimos: command.initialAmountCents,
            observacion_apertura: command.observation,
          }),
          command.openedAtUtc,
        ],
      );

      const createdRows = await this.findByIdempotencyKey(command.idempotencyKey);
      if (createdRows.length !== 1) throw new Error('No se pudo verificar la jornada creada.');
      const journey = mapOpenJourney(createdRows[0]);
      await this.database.commitTransaction();
      return journey;
    } catch (error: unknown) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private findByIdempotencyKey(key: string): Promise<readonly JourneyWriteRow[]> {
    return this.database.query(
      `SELECT j.id, j.fecha_negocio, j.monto_inicial_centimos,
              j.abierta_por_usuario_id, u.nombre_mostrar AS abierta_por_nombre,
              j.abierta_en_utc, j.observacion_apertura, j.clave_idempotencia
         FROM jornadas_caja j
         JOIN usuarios u ON u.id = j.abierta_por_usuario_id
        WHERE j.clave_idempotencia = ?
        LIMIT 1;`,
      [key],
    );
  }
}

function isSameRequest(row: JourneyWriteRow, command: JourneyOpeningCommand): boolean {
  return (
    row['fecha_negocio'] === command.businessDate &&
    row['monto_inicial_centimos'] === command.initialAmountCents &&
    row['abierta_por_usuario_id'] === command.actorUserId &&
    row['observacion_apertura'] === command.observation
  );
}

function mapOpenJourney(row: JourneyWriteRow): OpenJourney {
  return {
    id: requireString(row, 'id'),
    businessDate: requireString(row, 'fecha_negocio'),
    initialAmountCents: requireNonNegativeInteger(row, 'monto_inicial_centimos'),
    openedByUserId: requireString(row, 'abierta_por_usuario_id'),
    openedByDisplayName: requireString(row, 'abierta_por_nombre'),
    openedAtUtc: requireString(row, 'abierta_en_utc'),
  };
}

function requireString(row: JourneyWriteRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El campo ${key} de la jornada no es válido.`);
  }
  return value;
}

function requireNonNegativeInteger(row: JourneyWriteRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`El campo ${key} de la jornada no es válido.`);
  }
  return value;
}
