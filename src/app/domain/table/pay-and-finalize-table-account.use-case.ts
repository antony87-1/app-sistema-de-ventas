import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';
import type {
  QuickSalePaymentInput,
  QuickSalePaymentMethodCode,
} from '../sale/finalize-quick-sale.use-case';

export interface TablePaymentSelection {
  readonly detailId: string;
  readonly quantity: number;
}
export interface TablePaymentMethodCommand extends QuickSalePaymentInput {
  readonly entryId: string;
  readonly movementId: string;
}
export interface PayTableAccountCommand {
  readonly paymentId: string;
  readonly auditId: string;
  readonly operationId: string;
  readonly selections: readonly TablePaymentSelection[];
  readonly payments: readonly TablePaymentMethodCommand[];
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly confirmedAtUtc: string;
}
export interface TableAccountPaymentResult {
  readonly operationId: string;
  readonly operationCode: string;
  readonly paymentId: string;
  readonly amountCents: number;
  readonly balanceCents: number;
  readonly state: 'PAGADA_PARCIALMENTE' | 'PAGADA';
  readonly changeCents: number;
  readonly confirmedAtUtc: string;
}
export interface FinalizeTableAttentionCommand {
  readonly operationId: string;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly finalizedAtUtc: string;
}
export interface FinalizedTableAttention {
  readonly operationId: string;
  readonly operationCode: string;
  readonly finalizedAtUtc: string;
  readonly releasedTableIds: readonly string[];
}
export interface TableAccountPaymentRepository {
  pay(command: PayTableAccountCommand): Promise<TableAccountPaymentResult>;
  finalize(command: FinalizeTableAttentionCommand): Promise<FinalizedTableAttention>;
}
export class InvalidTablePaymentError extends Error {
  readonly code = 'INVALID_TABLE_PAYMENT';
}
export class TableAccountNotPayableError extends Error {
  readonly code = 'TABLE_ACCOUNT_NOT_PAYABLE';
}
export class TablePaymentIdempotencyConflictError extends Error {
  readonly code = 'TABLE_PAYMENT_IDEMPOTENCY_CONFLICT';
}
export class TableAttentionNotFinalizableError extends Error {
  readonly code = 'TABLE_ATTENTION_NOT_FINALIZABLE';
}

export class PayTableAccountUseCase {
  constructor(
    private readonly repository: TableAccountPaymentRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly nowUtc: () => string,
  ) {}
  execute(input: {
    operationId: string;
    selections: readonly TablePaymentSelection[];
    payments: readonly QuickSalePaymentInput[];
    idempotencyKey: string;
    actor: AuthenticatedIdentity;
  }): Promise<TableAccountPaymentResult> {
    this.authorization.assertCan(input.actor.role, 'REGISTRAR_PAGO_SEPARADO');
    const selections = input.selections.map((item) => ({
      detailId: item.detailId.trim(),
      quantity: item.quantity,
    }));
    if (
      !input.operationId.trim() ||
      !input.idempotencyKey.trim() ||
      !validSelections(selections) ||
      !validPayments(input.payments)
    )
      throw new InvalidTablePaymentError();
    return this.repository.pay({
      paymentId: this.generateId(),
      auditId: this.generateId(),
      operationId: input.operationId.trim(),
      selections,
      payments: input.payments.map((payment) => ({
        ...payment,
        entryId: this.generateId(),
        movementId: this.generateId(),
      })),
      actorUserId: input.actor.userId,
      idempotencyKey: input.idempotencyKey.trim(),
      confirmedAtUtc: this.nowUtc(),
    });
  }
}
export class FinalizeTableAttentionUseCase {
  constructor(
    private readonly repository: TableAccountPaymentRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly nowUtc: () => string,
  ) {}
  execute(
    operationId: string,
    idempotencyKey: string,
    actor: AuthenticatedIdentity,
  ): Promise<FinalizedTableAttention> {
    this.authorization.assertCan(actor.role, 'FINALIZAR_CUENTA');
    if (!operationId.trim() || !idempotencyKey.trim())
      throw new TableAttentionNotFinalizableError();
    return this.repository.finalize({
      operationId: operationId.trim(),
      actorUserId: actor.userId,
      idempotencyKey: idempotencyKey.trim(),
      finalizedAtUtc: this.nowUtc(),
    });
  }
}
function validSelections(items: readonly TablePaymentSelection[]): boolean {
  return (
    items.length > 0 &&
    new Set(items.map((item) => item.detailId)).size === items.length &&
    items.every(
      (item) =>
        item.detailId.length > 0 && Number.isSafeInteger(item.quantity) && item.quantity > 0,
    )
  );
}
function validPayments(items: readonly QuickSalePaymentInput[]): boolean {
  return (
    items.length > 0 &&
    items.length <= 2 &&
    new Set(items.map((item) => item.methodCode)).size === items.length &&
    items.every(
      (item) =>
        isMethod(item.methodCode) &&
        Number.isSafeInteger(item.appliedCents) &&
        item.appliedCents > 0 &&
        Number.isSafeInteger(item.receivedCents) &&
        item.receivedCents >= item.appliedCents &&
        (item.methodCode !== 'YAPE' || item.receivedCents === item.appliedCents),
    )
  );
}
function isMethod(value: string): value is QuickSalePaymentMethodCode {
  return value === 'EFECTIVO' || value === 'YAPE';
}
