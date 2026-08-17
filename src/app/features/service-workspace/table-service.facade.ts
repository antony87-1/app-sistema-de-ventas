import { Inject, Injectable, InjectionToken } from '@angular/core';

import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { SERVICE_TABLES_REPOSITORY } from '../../core/table/sqlite-service-tables.repository';
import { TABLE_ACCOUNT_REPOSITORY } from '../../core/table/sqlite-table-account.repository';
import { TABLE_ACCOUNT_MANAGEMENT_REPOSITORY } from '../../core/table/sqlite-table-account-management.repository';
import { TABLE_ACCOUNT_PAYMENT_REPOSITORY } from '../../core/table/sqlite-table-account-payment.repository';
import { currentLimaBusinessDate } from '../../core/time/lima-business-date';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  ListServiceTablesUseCase,
  type ServiceTable,
  type ServiceTablesRepository,
} from '../../domain/table/list-service-tables.use-case';
import {
  OpenTableAccountUseCase,
  type OpenedTableAccount,
  type TableAccountRepository,
} from '../../domain/table/open-table-account.use-case';
import {
  ManageTableAccountUseCase,
  type TableAccountManagementRepository,
  type TableAccountSnapshot,
} from '../../domain/table/manage-table-account.use-case';
import type {
  QuickSaleLineInput,
  QuickSalePriceAdjustmentInput,
} from '../../domain/sale/create-quick-sale.use-case';
import type { QuickSalePaymentInput } from '../../domain/sale/finalize-quick-sale.use-case';
import {
  FinalizeTableAttentionUseCase,
  PayTableAccountUseCase,
  type FinalizedTableAttention,
  type TableAccountPaymentRepository,
  type TableAccountPaymentResult,
  type TablePaymentSelection,
} from '../../domain/table/pay-and-finalize-table-account.use-case';

export interface TableServiceFacadePort {
  list(): Promise<readonly ServiceTable[]>;
  openAccount(
    tableId: string,
    note: string | null,
    idempotencyKey: string,
  ): Promise<OpenedTableAccount>;
  newRequestKey(): string;
  loadAccount(operationId: string): Promise<TableAccountSnapshot>;
  addToAccount(
    operationId: string,
    lines: readonly QuickSaleLineInput[],
    key: string,
  ): Promise<TableAccountSnapshot>;
  addAddonToAccount(
    operationId: string,
    detailId: string,
    addonProductId: string,
    key: string,
  ): Promise<TableAccountSnapshot>;
  changeAccountQuantity(
    operationId: string,
    detailId: string,
    target: number,
    key: string,
  ): Promise<TableAccountSnapshot>;
  changeAccountPrice(
    operationId: string,
    detailId: string,
    adjustment: QuickSalePriceAdjustmentInput | null,
    key: string,
  ): Promise<TableAccountSnapshot>;
  markAccountLineServed(
    operationId: string,
    detailId: string,
    key: string,
  ): Promise<TableAccountSnapshot>;
  linkTable(operationId: string, tableId: string, key: string): Promise<TableAccountSnapshot>;
  unlinkTable(operationId: string, tableId: string, key: string): Promise<TableAccountSnapshot>;
  payAccount(
    operationId: string,
    selections: readonly TablePaymentSelection[],
    payments: readonly QuickSalePaymentInput[],
    key: string,
  ): Promise<TableAccountPaymentResult>;
  finalizeAttention(operationId: string, key: string): Promise<FinalizedTableAttention>;
}
export const TABLE_SERVICE_FACADE = new InjectionToken<TableServiceFacadePort>(
  'TABLE_SERVICE_FACADE',
);

@Injectable()
export class TableServiceFacade implements TableServiceFacadePort {
  constructor(
    private readonly connection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(SERVICE_TABLES_REPOSITORY) private readonly tables: ServiceTablesRepository,
    @Inject(TABLE_ACCOUNT_REPOSITORY) private readonly accounts: TableAccountRepository,
    @Inject(TABLE_ACCOUNT_MANAGEMENT_REPOSITORY)
    private readonly management: TableAccountManagementRepository,
    @Inject(TABLE_ACCOUNT_PAYMENT_REPOSITORY)
    private readonly paymentRepository: TableAccountPaymentRepository,
  ) {}

  async list(): Promise<readonly ServiceTable[]> {
    await this.connection.initialize();
    const actor = this.requireActor();
    return new ListServiceTablesUseCase(this.tables, this.authorization).execute(actor);
  }
  async openAccount(
    tableId: string,
    note: string | null,
    key: string,
  ): Promise<OpenedTableAccount> {
    await this.connection.initialize();
    const actor = this.requireActor();
    return new OpenTableAccountUseCase(
      this.accounts,
      this.authorization,
      generateIdentifier,
      () =>
        `CM-${currentLimaBusinessDate().replaceAll('-', '')}-${generateIdentifier().slice(0, 8).toUpperCase()}`,
      () => new Date().toISOString(),
    ).execute({ tableId, note, idempotencyKey: key, actor });
  }
  newRequestKey(): string {
    return generateIdentifier();
  }
  async loadAccount(operationId: string) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return this.manager().load(operationId, actor);
  }
  async addToAccount(operationId: string, lines: readonly QuickSaleLineInput[], key: string) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return this.manager().add(operationId, lines, key, actor);
  }
  async addAddonToAccount(
    operationId: string,
    detailId: string,
    addonProductId: string,
    key: string,
  ) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return this.manager().addAddon(operationId, detailId, addonProductId, key, actor);
  }
  async changeAccountQuantity(operationId: string, detailId: string, target: number, key: string) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return this.manager().changeQuantity(operationId, detailId, target, key, actor);
  }
  async changeAccountPrice(
    operationId: string,
    detailId: string,
    adjustment: QuickSalePriceAdjustmentInput | null,
    key: string,
  ) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return this.manager().changePrice(operationId, detailId, adjustment, key, actor);
  }
  async markAccountLineServed(operationId: string, detailId: string, key: string) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return this.manager().markServed(operationId, detailId, key, actor);
  }
  async linkTable(operationId: string, tableId: string, key: string) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return this.manager().linkTable(operationId, tableId, key, actor);
  }
  async unlinkTable(operationId: string, tableId: string, key: string) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return this.manager().unlinkTable(operationId, tableId, key, actor);
  }
  async payAccount(
    operationId: string,
    selections: readonly TablePaymentSelection[],
    payments: readonly QuickSalePaymentInput[],
    key: string,
  ) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return new PayTableAccountUseCase(
      this.paymentRepository,
      this.authorization,
      generateIdentifier,
      () => new Date().toISOString(),
    ).execute({ operationId, selections, payments, idempotencyKey: key, actor });
  }
  async finalizeAttention(operationId: string, key: string) {
    await this.connection.initialize();
    const actor = this.requireActor();
    return new FinalizeTableAttentionUseCase(this.paymentRepository, this.authorization, () =>
      new Date().toISOString(),
    ).execute(operationId, key, actor);
  }
  private manager() {
    return new ManageTableAccountUseCase(
      this.management,
      this.authorization,
      generateIdentifier,
      () => new Date().toISOString(),
    );
  }
  private requireActor() {
    const actor = this.session.current();
    if (!actor) throw new ActiveTableSessionRequiredError();
    return actor;
  }
}
export class ActiveTableSessionRequiredError extends Error {
  readonly code = 'ACTIVE_TABLE_SESSION_REQUIRED';
}
function generateIdentifier(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
