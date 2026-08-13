import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';
import type { PendingQuickSaleLine } from './list-pending-quick-sales.use-case';

export interface QuickSaleHistoryItem {
  readonly operationId: string;
  readonly operationCode: string;
  readonly state: 'FINALIZADA' | 'ANULADA';
  readonly totalCents: number;
  readonly createdAtUtc: string;
  readonly closedAtUtc: string;
  readonly cancellationReason: string | null;
  readonly paymentMethods: readonly string[];
  readonly lines: readonly PendingQuickSaleLine[];
}

export interface QuickSaleHistoryRepository {
  list(): Promise<readonly QuickSaleHistoryItem[]>;
}

export class ListQuickSaleHistoryUseCase {
  constructor(
    private readonly repository: QuickSaleHistoryRepository,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  execute(actor: AuthenticatedIdentity): Promise<readonly QuickSaleHistoryItem[]> {
    this.authorization.assertCan(actor.role, 'CONSULTAR_OPERACIONES_DIA');
    return this.repository.list();
  }
}
