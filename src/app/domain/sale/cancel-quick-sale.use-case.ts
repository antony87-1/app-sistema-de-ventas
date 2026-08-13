import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface CancelQuickSaleCommand {
  readonly operationId: string;
  readonly reason: string;
  readonly actorUserId: string;
  readonly auditId: string;
  readonly cancelledAtUtc: string;
}

export interface CancelledQuickSale {
  readonly operationId: string;
  readonly operationCode: string;
  readonly reason: string;
  readonly cancelledByUserId: string;
  readonly cancelledAtUtc: string;
}

export interface QuickSaleCancellationRepository {
  cancel(command: CancelQuickSaleCommand): Promise<CancelledQuickSale>;
}

export class InvalidQuickSaleCancellationError extends Error {
  readonly code = 'INVALID_QUICK_SALE_CANCELLATION';
}
export class QuickSaleNotCancellableError extends Error {
  readonly code = 'QUICK_SALE_NOT_CANCELLABLE';
}
export class QuickSaleCancellationIdempotencyConflictError extends Error {
  readonly code = 'QUICK_SALE_CANCELLATION_IDEMPOTENCY_CONFLICT';
}

export class CancelQuickSaleUseCase {
  constructor(
    private readonly repository: QuickSaleCancellationRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly nowUtc: () => string,
  ) {}

  execute(input: {
    operationId: string;
    reason: string;
    idempotencyKey: string;
    actor: AuthenticatedIdentity;
  }): Promise<CancelledQuickSale> {
    this.authorization.assertCan(input.actor.role, 'REGISTRAR_VENTA_RAPIDA');
    const operationId = input.operationId.trim();
    const reason = input.reason.trim();
    const key = input.idempotencyKey.trim();
    if (!operationId || !reason || !key) throw new InvalidQuickSaleCancellationError();
    return this.repository.cancel({
      operationId,
      reason,
      actorUserId: input.actor.userId,
      auditId: key,
      cancelledAtUtc: this.nowUtc(),
    });
  }
}
