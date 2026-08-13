import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface RegisterExpenseInput {
  readonly categoryId: string;
  readonly paymentMethodId: string;
  readonly description: string;
  readonly amountCents: number;
  readonly supplier?: string | null;
  readonly note?: string | null;
  readonly idempotencyKey: string;
  readonly actor: AuthenticatedIdentity;
}

export interface ExpenseRegistrationCommand {
  readonly expenseId: string;
  readonly movementId: string;
  readonly auditId: string;
  readonly categoryId: string;
  readonly paymentMethodId: string;
  readonly description: string;
  readonly amountCents: number;
  readonly supplier: string | null;
  readonly note: string | null;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly occurredAtUtc: string;
}

export interface RegisteredExpense {
  readonly id: string;
  readonly journeyId: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly paymentMethodId: string;
  readonly paymentMethodName: string;
  readonly description: string;
  readonly amountCents: number;
  readonly supplier: string | null;
  readonly note: string | null;
  readonly registeredByUserId: string;
  readonly registeredAtUtc: string;
}

export interface ExpenseRegistrationRepository {
  register(command: ExpenseRegistrationCommand): Promise<RegisteredExpense>;
}

export class InvalidExpenseAmountError extends Error {
  readonly code = 'INVALID_EXPENSE_AMOUNT';

  constructor() {
    super('El monto del gasto debe ser mayor que cero.');
    this.name = 'InvalidExpenseAmountError';
  }
}

export class InvalidExpenseRequestError extends Error {
  readonly code = 'INVALID_EXPENSE_REQUEST';

  constructor() {
    super('Completa los datos obligatorios del gasto.');
    this.name = 'InvalidExpenseRequestError';
  }
}

export class ExpenseJourneyRequiredError extends Error {
  readonly code = 'EXPENSE_JOURNEY_REQUIRED';

  constructor() {
    super('Se necesita una jornada abierta para registrar el gasto.');
    this.name = 'ExpenseJourneyRequiredError';
  }
}

export class ActiveExpenseCategoryNotFoundError extends Error {
  readonly code = 'ACTIVE_EXPENSE_CATEGORY_NOT_FOUND';

  constructor() {
    super('La categoría de gasto seleccionada ya no está disponible.');
    this.name = 'ActiveExpenseCategoryNotFoundError';
  }
}

export class ActivePaymentMethodNotFoundError extends Error {
  readonly code = 'ACTIVE_PAYMENT_METHOD_NOT_FOUND';

  constructor() {
    super('El método de pago seleccionado ya no está disponible.');
    this.name = 'ActivePaymentMethodNotFoundError';
  }
}

export class ExpenseNoteRequiredError extends Error {
  readonly code = 'EXPENSE_NOTE_REQUIRED';

  constructor() {
    super('Explica en la nota la pérdida o el consumo no cobrado.');
    this.name = 'ExpenseNoteRequiredError';
  }
}

export class ExpenseIdempotencyConflictError extends Error {
  readonly code = 'EXPENSE_IDEMPOTENCY_CONFLICT';

  constructor() {
    super('La solicitud de gasto ya fue utilizada con datos diferentes.');
    this.name = 'ExpenseIdempotencyConflictError';
  }
}

export class RegisterExpenseUseCase {
  constructor(
    private readonly repository: ExpenseRegistrationRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly nowUtc: () => string,
  ) {}

  async execute(input: RegisterExpenseInput): Promise<RegisteredExpense> {
    this.authorization.assertCan(input.actor.role, 'REGISTRAR_GASTO');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new InvalidExpenseAmountError();
    }

    const categoryId = required(input.categoryId);
    const paymentMethodId = required(input.paymentMethodId);
    const description = required(input.description);
    const idempotencyKey = required(input.idempotencyKey);
    if (
      categoryId === null ||
      paymentMethodId === null ||
      description === null ||
      idempotencyKey === null
    ) {
      throw new InvalidExpenseRequestError();
    }

    return this.repository.register({
      expenseId: this.generateId(),
      movementId: this.generateId(),
      auditId: this.generateId(),
      categoryId,
      paymentMethodId,
      description,
      amountCents: input.amountCents,
      supplier: optional(input.supplier),
      note: optional(input.note),
      idempotencyKey,
      actorUserId: input.actor.userId,
      occurredAtUtc: this.nowUtc(),
    });
  }
}

function required(value: string): string | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function optional(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}
