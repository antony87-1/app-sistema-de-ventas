import { Inject, Injectable, InjectionToken } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { SCHEDULED_ORDERS_REPOSITORY } from '../../core/scheduled-order/sqlite-scheduled-orders.repository';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  ScheduledOrdersUseCase,
  type CreateScheduledOrderInput,
  type PreparationState,
  type ScheduledOrderSummary,
  type ScheduledOrdersRepository,
} from '../../domain/scheduled-order/manage-scheduled-orders.use-case';
import type { QuickSaleLineInput } from '../../domain/sale/create-quick-sale.use-case';
import type { QuickSalePaymentInput } from '../../domain/sale/finalize-quick-sale.use-case';
import { currentLimaBusinessDate } from '../../core/time/lima-business-date';

export interface ScheduledOrdersFacadePort {
  list(): Promise<readonly ScheduledOrderSummary[]>;
  create(
    input: Omit<CreateScheduledOrderInput, 'actor' | 'idempotencyKey'>,
    key: string,
  ): Promise<ScheduledOrderSummary>;
  advance(
    id: string,
    payments: readonly QuickSalePaymentInput[],
    key: string,
  ): Promise<ScheduledOrderSummary>;
  transition(id: string, state: PreparationState, key: string): Promise<ScheduledOrderSummary>;
  newRequestKey(): string;
}
export const SCHEDULED_ORDERS_FACADE = new InjectionToken<ScheduledOrdersFacadePort>(
  'SCHEDULED_ORDERS_FACADE',
);
@Injectable()
export class ScheduledOrdersFacade implements ScheduledOrdersFacadePort {
  constructor(
    private readonly connection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(SCHEDULED_ORDERS_REPOSITORY) private readonly repository: ScheduledOrdersRepository,
  ) {}
  async list() {
    await this.connection.initialize();
    return this.useCase().list(this.actor());
  }
  async create(
    input: {
      customerName: string;
      customerPhone: string;
      scheduledLocal: string;
      deliveryType: 'RECOJO' | 'DOMICILIO';
      address?: string | null;
      reference?: string | null;
      lines: readonly QuickSaleLineInput[];
    },
    key: string,
  ) {
    await this.connection.initialize();
    return this.useCase().create({ ...input, idempotencyKey: key, actor: this.actor() });
  }
  async advance(id: string, payments: readonly QuickSalePaymentInput[], key: string) {
    await this.connection.initialize();
    return this.useCase().advance(id, payments, key, this.actor());
  }
  async transition(id: string, state: PreparationState, key: string) {
    await this.connection.initialize();
    return this.useCase().transition(id, state, key, this.actor());
  }
  newRequestKey() {
    return generateId();
  }
  private useCase() {
    return new ScheduledOrdersUseCase(
      this.repository,
      this.authorization,
      generateId,
      () =>
        `PP-${currentLimaBusinessDate().replaceAll('-', '')}-${generateId().slice(0, 8).toUpperCase()}`,
      () => new Date().toISOString(),
    );
  }
  private actor() {
    const actor = this.session.current();
    if (!actor) throw new Error('ACTIVE_SCHEDULED_ORDER_SESSION_REQUIRED');
    return actor;
  }
}
function generateId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
