import { InjectionToken } from '@angular/core';

import {
  InvalidTableAdministrationError,
  TableWithOpenAccountsError,
  type ManagedTable,
  type SaveTableCommand,
  type TableAdministrationRepository,
} from '../../domain/table/manage-tables.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from '../sale/sqlite-quick-sale.repository';

export const TABLE_ADMINISTRATION_REPOSITORY = new InjectionToken<TableAdministrationRepository>(
  'TABLE_ADMINISTRATION_REPOSITORY',
);

export class SqliteTableAdministrationRepository implements TableAdministrationRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async list(): Promise<readonly ManagedTable[]> {
    const rows = await this.database.query(`
      SELECT m.id,m.codigo,m.nombre,m.orden,m.activo,
             COUNT(om.id) AS cuentas_abiertas
        FROM mesas m
        LEFT JOIN operacion_mesas om ON om.mesa_id=m.id AND om.liberada_en_utc IS NULL
       GROUP BY m.id,m.codigo,m.nombre,m.orden,m.activo
       ORDER BY m.orden,m.nombre,m.id;`);
    return rows.map(mapTable);
  }

  async save(command: SaveTableCommand): Promise<ManagedTable> {
    await this.database.beginTransaction();
    try {
      const existing = await this.database.query(
        `SELECT id,nombre,orden,activo FROM mesas WHERE id=? LIMIT 1;`,
        [command.id],
      );
      if (existing.length && !command.active) {
        const links = await this.database.query(
          `SELECT COUNT(*) AS total FROM operacion_mesas WHERE mesa_id=? AND liberada_en_utc IS NULL;`,
          [command.id],
        );
        if (integer(links[0], 'total') > 0) throw new TableWithOpenAccountsError();
      }
      if (existing.length) {
        await this.database.run(
          `UPDATE mesas SET nombre=?,orden=?,activo=?,actualizado_en_utc=? WHERE id=?;`,
          [command.name, command.order, command.active ? 1 : 0, command.occurredAtUtc, command.id],
        );
      } else {
        if (!command.code) throw new InvalidTableAdministrationError();
        await this.database.run(
          `INSERT INTO mesas (id,codigo,nombre,orden,activo,creado_en_utc,actualizado_en_utc) VALUES (?,?,?,?,1,?,?);`,
          [
            command.id,
            command.code,
            command.name,
            command.order,
            command.occurredAtUtc,
            command.occurredAtUtc,
          ],
        );
      }
      const journey = await this.database.query(
        `SELECT id FROM jornadas_caja WHERE estado='ABIERTA' LIMIT 1;`,
      );
      await this.database.run(
        `INSERT INTO auditoria (id,usuario_id,jornada_id,accion,entidad_tipo,entidad_id,valores_anteriores_json,valores_nuevos_json,ocurrido_en_utc) VALUES (?,?,?,?,?,?,?,?,?);`,
        [
          command.auditId,
          command.actorUserId,
          journey.length ? text(journey[0], 'id') : null,
          existing.length ? 'ACTUALIZAR_MESA' : 'CREAR_MESA',
          'MESA',
          command.id,
          existing.length ? JSON.stringify(existing[0]) : null,
          JSON.stringify({ nombre: command.name, orden: command.order, activo: command.active }),
          command.occurredAtUtc,
        ],
      );
      const result = (await this.list()).find((table) => table.id === command.id);
      if (!result) throw new InvalidTableAdministrationError();
      await this.database.commitTransaction();
      return result;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
}

function mapTable(row: QuickSaleRow): ManagedTable {
  return {
    id: text(row, 'id'),
    code: text(row, 'codigo'),
    name: text(row, 'nombre'),
    order: integer(row, 'orden'),
    active: integer(row, 'activo') === 1,
    openAccounts: integer(row, 'cuentas_abiertas'),
  };
}
function text(row: QuickSaleRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new InvalidTableAdministrationError();
  return value;
}
function integer(row: QuickSaleRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' && typeof value !== 'bigint')
    throw new InvalidTableAdministrationError();
  return Number(value);
}
