import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export type QuickSalePaymentMethodCode = 'EFECTIVO' | 'YAPE';

export interface QuickSalePaymentInput {
  readonly methodCode: QuickSalePaymentMethodCode;
  readonly appliedCents: number;
  readonly receivedCents: number;
}

export interface QuickSalePaymentCommand extends QuickSalePaymentInput {
  readonly paymentMethodEntryId: string;
  readonly movementId: string;
}

export interface FinalizeQuickSaleCommand {
  readonly paymentId: string;
  readonly auditId: string;
  readonly operationId: string;
  readonly payments: readonly QuickSalePaymentCommand[];
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly confirmedAtUtc: string;
}

export interface FinalizedQuickSale {
  readonly operationId: string;
  readonly operationCode: string;
  readonly paymentId: string;
  readonly totalCents: number;
  readonly receivedCents: number;
  readonly changeCents: number;
  readonly payments: readonly QuickSalePaymentInput[];
  readonly finalizedAtUtc: string;
}

export interface QuickSaleFinalizationRepository {
  finalize(command: FinalizeQuickSaleCommand): Promise<FinalizedQuickSale>;
}

export class InvalidQuickSalePaymentError extends Error {
  readonly code = 'INVALID_QUICK_SALE_PAYMENT';
}
export class QuickSaleNotPayableError extends Error {
  readonly code = 'QUICK_SALE_NOT_PAYABLE';
}
export class QuickSalePaymentIdempotencyConflictError extends Error {
  readonly code = 'QUICK_SALE_PAYMENT_IDEMPOTENCY_CONFLICT';
}

export class FinalizeQuickSaleUseCase {
  constructor(
    private readonly repository: QuickSaleFinalizationRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly nowUtc: () => string,
  ) {}

  execute(input: {
    operationId: string;
    payments: readonly QuickSalePaymentInput[];
    idempotencyKey: string;
    actor: AuthenticatedIdentity;
  }): Promise<FinalizedQuickSale> {
    this.authorization.assertCan(input.actor.role, 'COBRAR');
    const operationId = input.operationId.trim();
    const key = input.idempotencyKey.trim();
    if (
      !operationId ||
      !key ||
      input.payments.length < 1 ||
      input.payments.length > 2 ||
      new Set(input.payments.map(({ methodCode }) => methodCode)).size !== input.payments.length ||
      input.payments.some(
        ({ methodCode, appliedCents, receivedCents }) =>
          !Number.isSafeInteger(appliedCents) ||
          appliedCents <= 0 ||
          !Number.isSafeInteger(receivedCents) ||
          receivedCents < appliedCents ||
          (methodCode === 'YAPE' && receivedCents !== appliedCents),
      )
    ) {
      throw new InvalidQuickSalePaymentError();
    }
    return this.repository.finalize({
      paymentId: this.generateId(),
      auditId: this.generateId(),
      operationId,
      payments: input.payments.map((payment) => ({
        ...payment,
        paymentMethodEntryId: this.generateId(),
        movementId: this.generateId(),
      })),
      actorUserId: input.actor.userId,
      idempotencyKey: key,
      confirmedAtUtc: this.nowUtc(),
    });
  }
}
