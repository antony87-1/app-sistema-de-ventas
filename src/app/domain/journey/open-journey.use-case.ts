import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';
import { assertBusinessDate, type OpenJourney } from './get-open-journey-status.use-case';

export interface OpenJourneyInput {
  readonly initialAmountCents: number;
  readonly observation?: string | null;
  readonly idempotencyKey: string;
  readonly actor: AuthenticatedIdentity;
}

export interface JourneyOpeningCommand {
  readonly journeyId: string;
  readonly auditId: string;
  readonly businessDate: string;
  readonly initialAmountCents: number;
  readonly observation: string | null;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly openedAtUtc: string;
}

export interface JourneyOpeningRepository {
  open(command: JourneyOpeningCommand): Promise<OpenJourney>;
}

export class InvalidInitialAmountError extends Error {
  readonly code = 'INVALID_INITIAL_AMOUNT';

  constructor() {
    super('El monto inicial debe ser un importe válido igual o mayor que cero.');
    this.name = 'InvalidInitialAmountError';
  }
}

export class InvalidJourneyOpeningRequestError extends Error {
  readonly code = 'INVALID_JOURNEY_OPENING_REQUEST';

  constructor() {
    super('No se pudo identificar de forma segura la solicitud de apertura.');
    this.name = 'InvalidJourneyOpeningRequestError';
  }
}

export class JourneyAlreadyOpenError extends Error {
  readonly code = 'JOURNEY_ALREADY_OPEN';

  constructor() {
    super('Ya existe una jornada abierta. Debe cerrarse antes de abrir otra.');
    this.name = 'JourneyAlreadyOpenError';
  }
}

export class BusinessDateAlreadyHasJourneyError extends Error {
  readonly code = 'BUSINESS_DATE_ALREADY_HAS_JOURNEY';

  constructor() {
    super('La fecha de negocio ya tiene una jornada registrada.');
    this.name = 'BusinessDateAlreadyHasJourneyError';
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor() {
    super('La solicitud de apertura ya fue utilizada con datos diferentes.');
    this.name = 'IdempotencyConflictError';
  }
}

export class OpenJourneyUseCase {
  constructor(
    private readonly repository: JourneyOpeningRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly currentBusinessDate: () => string,
    private readonly nowUtc: () => string,
  ) {}

  async execute(input: OpenJourneyInput): Promise<OpenJourney> {
    this.authorization.assertCan(input.actor.role, 'ABRIR_JORNADA');
    if (!Number.isSafeInteger(input.initialAmountCents) || input.initialAmountCents < 0) {
      throw new InvalidInitialAmountError();
    }

    const idempotencyKey = input.idempotencyKey.trim();
    if (idempotencyKey.length === 0) throw new InvalidJourneyOpeningRequestError();

    const businessDate = this.currentBusinessDate();
    assertBusinessDate(businessDate);
    const observation = normalizeObservation(input.observation);

    return this.repository.open({
      journeyId: this.generateId(),
      auditId: this.generateId(),
      businessDate,
      initialAmountCents: input.initialAmountCents,
      observation,
      idempotencyKey,
      actorUserId: input.actor.userId,
      openedAtUtc: this.nowUtc(),
    });
  }
}

function normalizeObservation(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}
