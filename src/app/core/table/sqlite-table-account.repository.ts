import { InjectionToken } from '@angular/core';

import {
  OpenJourneyForTableAccountRequiredError,
  TableAccountIdempotencyConflictError,
  TableAccountLimitError,
  TableUnavailableError,
  type OpenedTableAccount,
  type OpenTableAccountCommand,
  type TableAccountRepository,
} from '../../domain/table/open-table-account.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from '../sale/sqlite-quick-sale.repository';

export const TABLE_ACCOUNT_REPOSITORY = new InjectionToken<TableAccountRepository>(
  'TABLE_ACCOUNT_REPOSITORY',
);

export class SqliteTableAccountRepository implements TableAccountRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async open(command: OpenTableAccountCommand): Promise<OpenedTableAccount> {
    await this.database.beginTransaction();
    try {
      const previous = await this.findByKey(command.idempotencyKey);
      if (previous.length) {
        if (!(await this.isSame(previous[0], command)))
          throw new TableAccountIdempotencyConflictError();
        const result = await this.mapOpened(previous[0]);
        await this.database.commitTransaction();
        return result;
      }
      const journey = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      if (!journey.length) throw new OpenJourneyForTableAccountRequiredError();
      const table = await this.database.query(
        `SELECT id FROM mesas WHERE id=? AND activo=1 LIMIT 1;`,
        [command.tableId],
      );
      if (!table.length) throw new TableUnavailableError();
      const countRows = await this.database.query(
        `SELECT COUNT(*) AS total FROM operacion_mesas om JOIN operaciones o ON o.id=om.operacion_id
          WHERE om.mesa_id=? AND om.liberada_en_utc IS NULL AND o.tipo='CUENTA_MESA'
            AND o.estado IN ('ABIERTA','PAGADA_PARCIALMENTE','PAGADA');`,
        [command.tableId],
      );
      if (integer(countRows[0], 'total') >= 2) throw new TableAccountLimitError();
      const journeyId = text(journey[0], 'id');
      await this.database.run(
        `INSERT INTO operaciones (id,codigo,tipo,estado,jornada_creacion_id,creada_por_usuario_id,
          creada_en_utc,subtotal_catalogo_centimos,descuento_total_centimos,total_centimos,
          pagado_centimos,saldo_centimos,nota,clave_idempotencia,version)
         VALUES (?,?,'CUENTA_MESA','ABIERTA',?,?,?,0,0,0,0,0,?,?,1);`,
        [
          command.operationId,
          command.operationCode,
          journeyId,
          command.actorUserId,
          command.createdAtUtc,
          command.note,
          command.idempotencyKey,
        ],
      );
      await this.database.run(
        `INSERT INTO operacion_mesas (id,operacion_id,mesa_id,rol_mesa,vinculada_por_usuario_id,vinculada_en_utc)
         VALUES (?,?,?,'PRINCIPAL',?,?);`,
        [
          command.associationId,
          command.operationId,
          command.tableId,
          command.actorUserId,
          command.createdAtUtc,
        ],
      );
      await this.database.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,
          valores_anteriores_json,valores_nuevos_json,motivo,ocurrido_en_utc)
         VALUES (?,?,?,'ABRIR_CUENTA_MESA','OPERACION',?,NULL,?,NULL,?);`,
        [
          command.auditId,
          command.actorUserId,
          journeyId,
          command.operationId,
          JSON.stringify({ mesa_id: command.tableId, estado: 'ABIERTA' }),
          command.createdAtUtc,
        ],
      );
      const created = await this.findByKey(command.idempotencyKey);
      const result = await this.mapOpened(created[0]);
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      if (error instanceof Error && error.message.includes('TABLE_ACTIVE_ACCOUNT_LIMIT'))
        throw new TableAccountLimitError();
      throw error;
    }
  }

  private findByKey(key: string): Promise<readonly QuickSaleRow[]> {
    return this.database.query(
      `SELECT o.id,o.codigo,o.jornada_creacion_id,o.creada_por_usuario_id,o.creada_en_utc,o.nota,om.mesa_id
         FROM operaciones o JOIN operacion_mesas om ON om.operacion_id=o.id AND om.rol_mesa='PRINCIPAL'
        WHERE o.clave_idempotencia=? AND o.tipo='CUENTA_MESA' LIMIT 1;`,
      [key],
    );
  }
  private async isSame(row: QuickSaleRow, command: OpenTableAccountCommand): Promise<boolean> {
    return (
      row['mesa_id'] === command.tableId &&
      row['creada_por_usuario_id'] === command.actorUserId &&
      row['nota'] === command.note
    );
  }
  private async mapOpened(row: QuickSaleRow): Promise<OpenedTableAccount> {
    const tableId = text(row, 'mesa_id');
    const rank = await this.database.query(
      `SELECT COUNT(*) AS total FROM operacion_mesas om JOIN operaciones o ON o.id=om.operacion_id
        WHERE om.mesa_id=? AND om.liberada_en_utc IS NULL AND o.tipo='CUENTA_MESA'
          AND (o.creada_en_utc < ? OR (o.creada_en_utc=? AND o.id<=?));`,
      [tableId, text(row, 'creada_en_utc'), text(row, 'creada_en_utc'), text(row, 'id')],
    );
    return {
      operationId: text(row, 'id'),
      operationCode: text(row, 'codigo'),
      tableId,
      accountLabel: integer(rank[0], 'total') <= 1 ? 'Cuenta A' : 'Cuenta B',
      journeyId: text(row, 'jornada_creacion_id'),
      createdAtUtc: text(row, 'creada_en_utc'),
    };
  }
}
function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Valor SQLite inv\u00e1lido: ${key}`);
  return value;
}
function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' && typeof value !== 'bigint')
    throw new Error(`Valor SQLite inv\u00e1lido: ${key}`);
  return Number(value);
}
