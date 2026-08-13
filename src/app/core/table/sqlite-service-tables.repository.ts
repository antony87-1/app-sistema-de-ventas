import { InjectionToken } from '@angular/core';

import type {
  ServiceTable,
  ServiceTableAccount,
  ServiceTablesRepository,
} from '../../domain/table/list-service-tables.use-case';
import type { QuickSaleDatabase, QuickSaleRow } from '../sale/sqlite-quick-sale.repository';

export const SERVICE_TABLES_REPOSITORY = new InjectionToken<ServiceTablesRepository>(
  'SERVICE_TABLES_REPOSITORY',
);

export class SqliteServiceTablesRepository implements ServiceTablesRepository {
  constructor(private readonly database: QuickSaleDatabase) {}

  async list(): Promise<readonly ServiceTable[]> {
    const [tables, links] = await Promise.all([
      this.database.query(
        `SELECT id,codigo,nombre FROM mesas WHERE activo=1 ORDER BY orden,nombre,id;`,
      ),
      this.database.query(
        `SELECT om.mesa_id,om.rol_mesa,o.id AS operacion_id,o.codigo,o.estado,
                o.total_centimos,o.saldo_centimos,o.creada_en_utc,
                EXISTS(SELECT 1 FROM operacion_detalles d WHERE d.operacion_id=o.id
                       AND d.estado_servicio='PENDIENTE') AS pendiente_servir
           FROM operacion_mesas om JOIN operaciones o ON o.id=om.operacion_id
          WHERE om.liberada_en_utc IS NULL AND o.tipo='CUENTA_MESA'
            AND o.estado IN ('ABIERTA','PAGADA_PARCIALMENTE','PAGADA')
          ORDER BY o.creada_en_utc,o.id;`,
      ),
    ]);
    const tableNames = new Map(tables.map((row) => [text(row, 'id'), text(row, 'nombre')]));
    const principalByOperation = new Map<string, string>();
    const linkedIds = new Set<string>();
    for (const link of links) {
      const operationId = text(link, 'operacion_id');
      const tableId = text(link, 'mesa_id');
      if (link['rol_mesa'] === 'PRINCIPAL') principalByOperation.set(operationId, tableId);
      else linkedIds.add(tableId);
    }
    const accountsByTable = new Map<string, ServiceTableAccount[]>();
    const joinedNamesByTable = new Map<string, Set<string>>();
    for (const link of links) {
      const operationId = text(link, 'operacion_id');
      const principalId = principalByOperation.get(operationId);
      if (!principalId) continue;
      if (link['rol_mesa'] === 'VINCULADA') {
        const name = tableNames.get(text(link, 'mesa_id'));
        if (name) {
          const names = joinedNamesByTable.get(principalId) ?? new Set<string>();
          names.add(name);
          joinedNamesByTable.set(principalId, names);
        }
        continue;
      }
      const accounts = accountsByTable.get(principalId) ?? [];
      accounts.push({
        operationId,
        operationCode: text(link, 'codigo'),
        label: accounts.length === 0 ? 'Cuenta A' : 'Cuenta B',
        state: accountState(link),
        balanceCents: integer(link, 'saldo_centimos'),
        createdAtUtc: text(link, 'creada_en_utc'),
      });
      accountsByTable.set(principalId, accounts);
    }
    return tables
      .filter((row) => !linkedIds.has(text(row, 'id')))
      .map((row) => {
        const id = text(row, 'id');
        const accounts = accountsByTable.get(id) ?? [];
        const linked = [...(joinedNamesByTable.get(id) ?? [])];
        const name = text(row, 'nombre');
        return {
          id,
          code: text(row, 'codigo'),
          name,
          joinedName: linked.length ? [name, ...linked].join(' + ') : null,
          state: tableState(accounts),
          balanceCents: accounts.reduce((sum, account) => sum + account.balanceCents, 0),
          accounts,
        };
      });
  }
}

function accountState(row: QuickSaleRow): ServiceTableAccount['state'] {
  if (integer(row, 'pendiente_servir') > 0) return 'PENDIENTE_SERVIR';
  if (integer(row, 'total_centimos') > 0 && integer(row, 'saldo_centimos') === 0) return 'PAGADA';
  return 'OCUPADA';
}
function tableState(accounts: readonly ServiceTableAccount[]): ServiceTable['state'] {
  if (!accounts.length) return 'DISPONIBLE';
  if (accounts.some((account) => account.state === 'PENDIENTE_SERVIR')) return 'PENDIENTE_SERVIR';
  if (accounts.every((account) => account.state === 'PAGADA')) return 'PAGADA';
  return 'OCUPADA';
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
