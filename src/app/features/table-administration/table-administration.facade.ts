import { Inject, Injectable, InjectionToken } from '@angular/core';

import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { TABLE_ADMINISTRATION_REPOSITORY } from '../../core/table/sqlite-table-administration.repository';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  ManageTablesUseCase,
  type ManagedTable,
  type TableAdministrationRepository,
} from '../../domain/table/manage-tables.use-case';

export interface TableAdministrationFacadePort {
  list(): Promise<readonly ManagedTable[]>;
  save(input: { id?: string; name: string; order: number; active: boolean }): Promise<ManagedTable>;
}
export const TABLE_ADMINISTRATION_FACADE = new InjectionToken<TableAdministrationFacadePort>(
  'TABLE_ADMINISTRATION_FACADE',
);

@Injectable()
export class TableAdministrationFacade implements TableAdministrationFacadePort {
  constructor(
    private readonly connection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(TABLE_ADMINISTRATION_REPOSITORY)
    private readonly repository: TableAdministrationRepository,
  ) {}
  async list() {
    await this.connection.initialize();
    return this.useCase().list(this.actor());
  }
  async save(input: { id?: string; name: string; order: number; active: boolean }) {
    await this.connection.initialize();
    return this.useCase().save({ ...input, actor: this.actor() });
  }
  private useCase() {
    return new ManageTablesUseCase(this.repository, this.authorization, uuid, () =>
      new Date().toISOString(),
    );
  }
  private actor() {
    const actor = this.session.current();
    if (!actor) throw new Error('Se requiere una sesión activa.');
    return actor;
  }
}
function uuid(): string {
  return globalThis.crypto.randomUUID();
}
