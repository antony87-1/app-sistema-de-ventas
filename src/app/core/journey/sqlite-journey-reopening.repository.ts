import { InjectionToken } from '@angular/core';
import { JourneyReopeningIdempotencyConflictError } from '../../domain/journey/reopen-journey.use-case';
import type {
  JourneyReopeningCommand,
  JourneyReopeningRepository,
  ReopenCandidate,
  ReopenedJourney,
} from '../../domain/journey/reopen-journey.use-case';

export const JOURNEY_REOPENING_REPOSITORY = new InjectionToken<JourneyReopeningRepository>(
  'JOURNEY_REOPENING_REPOSITORY',
);
export type ReopeningValue = string | number | bigint | null | Uint8Array;
export type ReopeningRow = Readonly<Record<string, ReopeningValue>>;
export interface ReopeningDatabase {
  query(sql: string, values?: readonly ReopeningValue[]): Promise<readonly ReopeningRow[]>;
  run(sql: string, values?: readonly ReopeningValue[]): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}
export class SqliteJourneyReopeningRepository implements JourneyReopeningRepository {
  constructor(private readonly db: ReopeningDatabase) {}
  async findLatestCandidate(): Promise<ReopenCandidate | null> {
    const rows = await this.db.query(
      `SELECT j.id AS jornada_id,j.fecha_negocio,c.id AS cierre_id,c.tipo,c.cerrado_en_utc FROM jornadas_caja j JOIN cierres_jornada c ON c.jornada_id=j.id WHERE j.estado='CERRADA' AND c.secuencia=(SELECT MAX(c2.secuencia) FROM cierres_jornada c2 WHERE c2.jornada_id=j.id) ORDER BY c.cerrado_en_utc DESC LIMIT 1;`,
    );
    return rows.length ? mapCandidate(rows[0]) : null;
  }
  async reopen(command: JourneyReopeningCommand): Promise<ReopenedJourney> {
    await this.db.beginTransaction();
    try {
      const old = await this.findByKey(command.idempotencyKey);
      if (old.length) {
        if (!isSameRequest(old[0], command)) throw new JourneyReopeningIdempotencyConflictError();
        const result = mapReopened(old[0]);
        await this.db.commitTransaction();
        return result;
      }
      const open = await this.db.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (open.length) throw new Error('JOURNEY_ALREADY_OPEN');
      const rows = await this.db.query(
        `SELECT j.id AS jornada_id,j.fecha_negocio,c.id AS cierre_id,c.tipo,c.cerrado_en_utc FROM cierres_jornada c JOIN jornadas_caja j ON j.id=c.jornada_id WHERE c.id=? AND j.estado='CERRADA' AND c.secuencia=(SELECT MAX(c2.secuencia) FROM cierres_jornada c2 WHERE c2.jornada_id=j.id) LIMIT 1;`,
        [command.closeId],
      );
      if (!rows.length) throw new Error('REOPEN_CANDIDATE_CHANGED');
      const candidate = mapCandidate(rows[0]);
      await this.db.run(
        `INSERT INTO reaperturas_jornada (id,jornada_id,cierre_reabierto_id,reabierta_por_usuario_id,motivo,reabierta_en_utc,clave_idempotencia) VALUES (?,?,?,?,?,?,?);`,
        [
          command.reopeningId,
          candidate.journeyId,
          candidate.closeId,
          command.actorUserId,
          command.reason,
          command.reopenedAtUtc,
          command.idempotencyKey,
        ],
      );
      await this.db.run(
        `UPDATE jornadas_caja SET estado='ABIERTA',version=version+1 WHERE id=? AND estado='CERRADA';`,
        [candidate.journeyId],
      );
      await this.db.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,valores_anteriores_json,valores_nuevos_json,motivo,ocurrido_en_utc) VALUES (?,?,?,'REABRIR_JORNADA','REAPERTURA_JORNADA',?,?,?, ?,?);`,
        [
          command.auditId,
          command.actorUserId,
          candidate.journeyId,
          command.reopeningId,
          JSON.stringify({ estado_jornada: 'CERRADA', cierre_id: candidate.closeId }),
          JSON.stringify({ estado_jornada: 'ABIERTA' }),
          command.reason,
          command.reopenedAtUtc,
        ],
      );
      const created = await this.findByKey(command.idempotencyKey);
      const result = mapReopened(created[0]);
      await this.db.commitTransaction();
      return result;
    } catch (e) {
      await this.db.rollbackTransaction();
      throw e;
    }
  }
  private findByKey(key: string) {
    return this.db.query(
      `SELECT r.id AS reapertura_id,r.jornada_id,j.fecha_negocio,r.cierre_reabierto_id AS cierre_id,c.tipo,c.cerrado_en_utc,r.motivo,r.reabierta_por_usuario_id,r.reabierta_en_utc FROM reaperturas_jornada r JOIN jornadas_caja j ON j.id=r.jornada_id JOIN cierres_jornada c ON c.id=r.cierre_reabierto_id WHERE r.clave_idempotencia=? LIMIT 1;`,
      [key],
    );
  }
}
function text(row: ReopeningRow, key: string) {
  const v = row[key];
  if (typeof v !== 'string' || !v) throw new Error(`Campo ${key} inválido`);
  return v;
}
function mapCandidate(r: ReopeningRow): ReopenCandidate {
  return {
    journeyId: text(r, 'jornada_id'),
    businessDate: text(r, 'fecha_negocio'),
    closeId: text(r, 'cierre_id'),
    closeType: text(r, 'tipo') as ReopenCandidate['closeType'],
    closedAtUtc: text(r, 'cerrado_en_utc'),
  };
}
function mapReopened(r: ReopeningRow): ReopenedJourney {
  return {
    ...mapCandidate(r),
    reopeningId: text(r, 'reapertura_id'),
    reason: text(r, 'motivo'),
    reopenedByUserId: text(r, 'reabierta_por_usuario_id'),
    reopenedAtUtc: text(r, 'reabierta_en_utc'),
  };
}
function isSameRequest(row: ReopeningRow, command: JourneyReopeningCommand): boolean {
  return (
    row['cierre_id'] === command.closeId &&
    row['motivo'] === command.reason &&
    row['reabierta_por_usuario_id'] === command.actorUserId
  );
}
