import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface OpenTableAccountCommand {
  readonly operationId: string;
  readonly operationCode: string;
  readonly associationId: string;
  readonly auditId: string;
  readonly tableId: string;
  readonly note: string | null;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly createdAtUtc: string;
}

export interface OpenedTableAccount {
  readonly operationId: string;
  readonly operationCode: string;
  readonly tableId: string;
  readonly accountLabel: 'Cuenta A' | 'Cuenta B';
  readonly journeyId: string;
  readonly createdAtUtc: string;
}

export interface TableAccountRepository {
  open(command: OpenTableAccountCommand): Promise<OpenedTableAccount>;
}

export class InvalidTableAccountRequestError extends Error {
  readonly code = 'INVALID_TABLE_ACCOUNT_REQUEST';
}
export class OpenJourneyForTableAccountRequiredError extends Error {
  readonly code = 'OPEN_JOURNEY_FOR_TABLE_ACCOUNT_REQUIRED';
}
export class TableUnavailableError extends Error {
  readonly code = 'TABLE_UNAVAILABLE';
}
export class TableAccountLimitError extends Error {
  readonly code = 'TABLE_ACCOUNT_LIMIT';
}
export class TableAccountIdempotencyConflictError extends Error {
  readonly code = 'TABLE_ACCOUNT_IDEMPOTENCY_CONFLICT';
}

export class OpenTableAccountUseCase {
  constructor(
    private readonly repository: TableAccountRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly generateOperationCode: () => string,
    private readonly nowUtc: () => string,
  ) {}

  execute(input: {
    tableId: string;
    note?: string | null;
    idempotencyKey: string;
    actor: AuthenticatedIdentity;
  }): Promise<OpenedTableAccount> {
    this.authorization.assertCan(input.actor.role, 'ABRIR_CUENTA_MESA');
    const tableId = input.tableId.trim();
    const key = input.idempotencyKey.trim();
    if (!tableId || !key) throw new InvalidTableAccountRequestError();
    return this.repository.open({
      operationId: this.generateId(),
      operationCode: this.generateOperationCode(),
      associationId: this.generateId(),
      auditId: this.generateId(),
      tableId,
      note: normalizeOptional(input.note),
      idempotencyKey: key,
      actorUserId: input.actor.userId,
      createdAtUtc: this.nowUtc(),
    });
  }
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized : null;
}
