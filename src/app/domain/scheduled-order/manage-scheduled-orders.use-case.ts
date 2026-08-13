import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';
import type { QuickSaleLineInput } from '../sale/create-quick-sale.use-case';
import type { QuickSalePaymentInput } from '../sale/finalize-quick-sale.use-case';

export type PreparationState =
  | 'REGISTRADO'
  | 'PENDIENTE_DE_PREPARACION'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'ENTREGADO'
  | 'ANULADO';
export type ScheduledPaymentState =
  | 'SIN_ADELANTO'
  | 'CON_ADELANTO'
  | 'PAGADO_PARCIALMENTE'
  | 'PAGADO'
  | 'PENDIENTE_DE_PAGO'
  | 'PAGO_BLOQUEADO_REVISION';
export interface ScheduledOrderLineSummary {
  readonly name: string;
  readonly presentation: string | null;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly subtotalCents: number;
}
export interface ScheduledOrderSummary {
  readonly operationId: string;
  readonly operationCode: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly scheduledLocal: string;
  readonly deliveryType: 'RECOJO' | 'DOMICILIO';
  readonly address: string | null;
  readonly preparationState: PreparationState;
  readonly paymentState: ScheduledPaymentState;
  readonly totalCents: number;
  readonly paidCents: number;
  readonly balanceCents: number;
  readonly lines: readonly ScheduledOrderLineSummary[];
}
export interface ScheduledCustomLineInput {
  readonly customDescription: string;
  readonly presentation: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
}
export type ScheduledOrderLineInput = QuickSaleLineInput | ScheduledCustomLineInput;
export interface CreateScheduledOrderInput {
  readonly customerName: string;
  readonly customerPhone: string;
  readonly scheduledLocal: string;
  readonly deliveryType: 'RECOJO' | 'DOMICILIO';
  readonly address?: string | null;
  readonly reference?: string | null;
  readonly lines: readonly ScheduledOrderLineInput[];
  readonly idempotencyKey: string;
  readonly actor: AuthenticatedIdentity;
}
export interface ScheduledOrderCommand {
  readonly operationId: string;
  readonly operationCode: string;
  readonly auditId: string;
  readonly input: Omit<CreateScheduledOrderInput, 'actor'>;
  readonly detailIds: readonly { principalId: string; addonIds: readonly string[] }[];
  readonly actorUserId: string;
  readonly occurredAtUtc: string;
}
export interface ScheduledAdvanceCommand {
  readonly operationId: string;
  readonly paymentId: string;
  readonly auditId: string;
  readonly payments: readonly (QuickSalePaymentInput & { entryId: string; movementId: string })[];
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly occurredAtUtc: string;
}
export interface ScheduledTransitionCommand {
  readonly operationId: string;
  readonly targetState: PreparationState;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly occurredAtUtc: string;
}
export interface ScheduledOrdersRepository {
  create(command: ScheduledOrderCommand): Promise<ScheduledOrderSummary>;
  list(): Promise<readonly ScheduledOrderSummary[]>;
  registerAdvance(command: ScheduledAdvanceCommand): Promise<ScheduledOrderSummary>;
  transition(command: ScheduledTransitionCommand): Promise<ScheduledOrderSummary>;
}
export class InvalidScheduledOrderError extends Error {
  readonly code = 'INVALID_SCHEDULED_ORDER';
}
export class ScheduledOrderLockedError extends Error {
  readonly code = 'SCHEDULED_ORDER_LOCKED';
}
export class ScheduledAdvanceInvalidError extends Error {
  readonly code = 'SCHEDULED_ADVANCE_INVALID';
}

export class ScheduledOrdersUseCase {
  constructor(
    private readonly repository: ScheduledOrdersRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly generateCode: () => string,
    private readonly nowUtc: () => string,
  ) {}
  create(input: CreateScheduledOrderInput) {
    this.authorization.assertCan(input.actor.role, 'REGISTRAR_PEDIDO_PROGRAMADO');
    if (!validCreate(input)) throw new InvalidScheduledOrderError();
    return this.repository.create({
      operationId: this.generateId(),
      operationCode: this.generateCode(),
      auditId: this.generateId(),
      input: {
        ...input,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        address: optional(input.address),
        reference: optional(input.reference),
      },
      detailIds: input.lines.map((line) => ({
        principalId: this.generateId(),
        addonIds: ('addons' in line ? (line.addons ?? []) : []).map(() => this.generateId()),
      })),
      actorUserId: input.actor.userId,
      occurredAtUtc: this.nowUtc(),
    });
  }
  list(actor: AuthenticatedIdentity) {
    this.authorization.assertCan(actor.role, 'CONSULTAR_OPERACIONES_DIA');
    return this.repository.list();
  }
  advance(
    operationId: string,
    payments: readonly QuickSalePaymentInput[],
    key: string,
    actor: AuthenticatedIdentity,
  ) {
    this.authorization.assertCan(actor.role, 'REGISTRAR_ADELANTO_PEDIDO');
    if (!operationId.trim() || !key.trim() || !validPayments(payments))
      throw new ScheduledAdvanceInvalidError();
    return this.repository.registerAdvance({
      operationId: operationId.trim(),
      paymentId: this.generateId(),
      auditId: this.generateId(),
      payments: payments.map((item) => ({
        ...item,
        entryId: this.generateId(),
        movementId: this.generateId(),
      })),
      actorUserId: actor.userId,
      idempotencyKey: key.trim(),
      occurredAtUtc: this.nowUtc(),
    });
  }
  transition(
    operationId: string,
    targetState: PreparationState,
    key: string,
    actor: AuthenticatedIdentity,
  ) {
    this.authorization.assertCan(actor.role, 'MODIFICAR_PEDIDO_PROGRAMADO');
    if (!operationId.trim() || !key.trim()) throw new InvalidScheduledOrderError();
    return this.repository.transition({
      operationId: operationId.trim(),
      targetState,
      actorUserId: actor.userId,
      idempotencyKey: key.trim(),
      occurredAtUtc: this.nowUtc(),
    });
  }
}
function validCreate(input: CreateScheduledOrderInput) {
  return (
    input.customerName.trim().length > 0 &&
    input.customerPhone.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.scheduledLocal) &&
    input.lines.length > 0 &&
    (input.deliveryType !== 'DOMICILIO' || !!input.address?.trim()) &&
    input.idempotencyKey.trim().length > 0 &&
    input.lines.every((line) => {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) return false;
      if ('productId' in line) return line.productId.trim().length > 0;
      return (
        line.customDescription.trim().length > 0 &&
        line.customDescription.trim().length <= 160 &&
        line.presentation.trim().length > 0 &&
        line.presentation.trim().length <= 80 &&
        Number.isSafeInteger(line.unitPriceCents) &&
        line.unitPriceCents > 0
      );
    })
  );
}
function validPayments(items: readonly QuickSalePaymentInput[]) {
  return (
    items.length > 0 &&
    items.length <= 2 &&
    new Set(items.map((item) => item.methodCode)).size === items.length &&
    items.every(
      (item) =>
        item.appliedCents > 0 &&
        Number.isSafeInteger(item.appliedCents) &&
        item.receivedCents >= item.appliedCents &&
        Number.isSafeInteger(item.receivedCents) &&
        (item.methodCode !== 'YAPE' || item.receivedCents === item.appliedCents),
    )
  );
}
function optional(value: string | null | undefined) {
  const result = value?.trim() ?? '';
  return result || null;
}
