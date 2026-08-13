import { Inject, Injectable, InjectionToken } from '@angular/core';

import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { QUICK_SALE_REPOSITORY } from '../../core/sale/sqlite-quick-sale.repository';
import { QUICK_SALE_FINALIZATION_REPOSITORY } from '../../core/sale/sqlite-quick-sale-finalization.repository';
import { PENDING_QUICK_SALES_REPOSITORY } from '../../core/sale/sqlite-pending-quick-sales.repository';
import { QUICK_SALE_CANCELLATION_REPOSITORY } from '../../core/sale/sqlite-quick-sale-cancellation.repository';
import { QUICK_SALE_HISTORY_REPOSITORY } from '../../core/sale/sqlite-quick-sale-history.repository';
import { currentLimaBusinessDate } from '../../core/time/lima-business-date';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  CreateQuickSaleUseCase,
  type CreatedQuickSale,
  type QuickSaleLineInput,
  type QuickSaleRepository,
} from '../../domain/sale/create-quick-sale.use-case';
import {
  FinalizeQuickSaleUseCase,
  type FinalizedQuickSale,
  type QuickSaleFinalizationRepository,
  type QuickSalePaymentInput,
} from '../../domain/sale/finalize-quick-sale.use-case';
import {
  ListPendingQuickSalesUseCase,
  type PendingQuickSale,
  type PendingQuickSalesRepository,
} from '../../domain/sale/list-pending-quick-sales.use-case';
import {
  CancelQuickSaleUseCase,
  type CancelledQuickSale,
  type QuickSaleCancellationRepository,
} from '../../domain/sale/cancel-quick-sale.use-case';
import {
  ListQuickSaleHistoryUseCase,
  type QuickSaleHistoryItem,
  type QuickSaleHistoryRepository,
} from '../../domain/sale/list-quick-sale-history.use-case';

export interface QuickSaleFacadePort {
  create(
    lines: readonly QuickSaleLineInput[],
    note: string | null,
    idempotencyKey: string,
  ): Promise<CreatedQuickSale>;
  newRequestKey(): string;
  finalize(
    operationId: string,
    payments: readonly QuickSalePaymentInput[],
    idempotencyKey: string,
  ): Promise<FinalizedQuickSale>;
  listPending(): Promise<readonly PendingQuickSale[]>;
  cancel(operationId: string, reason: string, idempotencyKey: string): Promise<CancelledQuickSale>;
  listHistory(): Promise<readonly QuickSaleHistoryItem[]>;
}

export const QUICK_SALE_FACADE = new InjectionToken<QuickSaleFacadePort>('QUICK_SALE_FACADE');

@Injectable()
export class QuickSaleFacade implements QuickSaleFacadePort {
  constructor(
    private readonly databaseConnection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(QUICK_SALE_REPOSITORY) private readonly repository: QuickSaleRepository,
    @Inject(QUICK_SALE_FINALIZATION_REPOSITORY)
    private readonly finalizationRepository: QuickSaleFinalizationRepository,
    @Inject(PENDING_QUICK_SALES_REPOSITORY)
    private readonly pendingRepository: PendingQuickSalesRepository,
    @Inject(QUICK_SALE_CANCELLATION_REPOSITORY)
    private readonly cancellationRepository: QuickSaleCancellationRepository,
    @Inject(QUICK_SALE_HISTORY_REPOSITORY)
    private readonly historyRepository: QuickSaleHistoryRepository,
  ) {}

  async create(
    lines: readonly QuickSaleLineInput[],
    note: string | null,
    idempotencyKey: string,
  ): Promise<CreatedQuickSale> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveQuickSaleSessionRequiredError();
    return new CreateQuickSaleUseCase(
      this.repository,
      this.authorization,
      generateIdentifier,
      generateOperationCode,
      () => new Date().toISOString(),
    ).execute({ lines, note, idempotencyKey, actor });
  }

  newRequestKey(): string {
    return generateIdentifier();
  }

  async finalize(
    operationId: string,
    payments: readonly QuickSalePaymentInput[],
    idempotencyKey: string,
  ): Promise<FinalizedQuickSale> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveQuickSaleSessionRequiredError();
    return new FinalizeQuickSaleUseCase(
      this.finalizationRepository,
      this.authorization,
      generateIdentifier,
      () => new Date().toISOString(),
    ).execute({ operationId, payments, idempotencyKey, actor });
  }

  async listPending(): Promise<readonly PendingQuickSale[]> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveQuickSaleSessionRequiredError();
    return new ListPendingQuickSalesUseCase(this.pendingRepository, this.authorization).execute(
      actor,
    );
  }

  async cancel(
    operationId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<CancelledQuickSale> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveQuickSaleSessionRequiredError();
    return new CancelQuickSaleUseCase(this.cancellationRepository, this.authorization, () =>
      new Date().toISOString(),
    ).execute({ operationId, reason, idempotencyKey, actor });
  }

  async listHistory(): Promise<readonly QuickSaleHistoryItem[]> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveQuickSaleSessionRequiredError();
    return new ListQuickSaleHistoryUseCase(this.historyRepository, this.authorization).execute(
      actor,
    );
  }
}

export class ActiveQuickSaleSessionRequiredError extends Error {
  readonly code = 'ACTIVE_QUICK_SALE_SESSION_REQUIRED';
}

function generateOperationCode(): string {
  return `VR-${currentLimaBusinessDate().replaceAll('-', '')}-${generateIdentifier().slice(0, 8).toUpperCase()}`;
}

function generateIdentifier(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
