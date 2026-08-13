import { InjectionToken } from '@angular/core';

import type {
  OpenJourney,
  OpenJourneyRepository,
} from '../../domain/journey/get-open-journey-status.use-case';

export const OPEN_JOURNEY_REPOSITORY = new InjectionToken<OpenJourneyRepository>(
  'OPEN_JOURNEY_REPOSITORY',
);

export type JourneyQueryValue = string | number | bigint | null | Uint8Array;
export type JourneyQueryRow = Readonly<Record<string, JourneyQueryValue>>;

export interface JourneyQueryDatabase {
  query(
    statement: string,
    values?: readonly JourneyQueryValue[],
  ): Promise<readonly JourneyQueryRow[]>;
}

export class SqliteOpenJourneyRepository implements OpenJourneyRepository {
  constructor(private readonly database: JourneyQueryDatabase) {}

  async findOpen(): Promise<OpenJourney | null> {
    const rows = await this.database.query(
      `SELECT j.id, j.fecha_negocio, j.monto_inicial_centimos,
              j.abierta_por_usuario_id, u.nombre_mostrar AS abierta_por_nombre,
              j.abierta_en_utc
         FROM jornadas_caja j
         JOIN usuarios u ON u.id = j.abierta_por_usuario_id
        WHERE j.estado = 'ABIERTA'
        LIMIT 1;`,
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: requireString(row, 'id'),
      businessDate: requireString(row, 'fecha_negocio'),
      initialAmountCents: requireNonNegativeInteger(row, 'monto_inicial_centimos'),
      openedByUserId: requireString(row, 'abierta_por_usuario_id'),
      openedByDisplayName: requireString(row, 'abierta_por_nombre'),
      openedAtUtc: requireString(row, 'abierta_en_utc'),
    };
  }
}

function requireString(row: JourneyQueryRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El campo ${key} de la jornada no es válido.`);
  }
  return value;
}

function requireNonNegativeInteger(row: JourneyQueryRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`El campo ${key} de la jornada no es válido.`);
  }
  return value;
}
