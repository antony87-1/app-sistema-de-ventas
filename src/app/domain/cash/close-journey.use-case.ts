import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface CloseJourneyInput {
  readonly actualCashCents: number;
  readonly justification?: string | null;
  readonly idempotencyKey: string;
  readonly actor: AuthenticatedIdentity;
}

export interface CloseJourneyCommand {
  readonly closeId: string;
  readonly auditId: string;
  readonly actualCashCents: number;
  readonly justification: string | null;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly closedAtUtc: string;
  readonly currentBusinessDate: string;
}

export interface ClosedJourney {
  readonly closeId: string;
  readonly journeyId: string;
  readonly businessDate: string;
  readonly expectedCashCents: number;
  readonly actualCashCents: number;
  readonly differenceType: 'CUADRA' | 'SOBRANTE' | 'FALTANTE';
  readonly differenceCents: number;
  readonly justification: string | null;
  readonly closedByUserId: string;
  readonly closedAtUtc: string;
}

export interface PendingJourneyCorrection {
  readonly journeyId: string;
  readonly businessDate: string;
  readonly reopeningId: string;
  readonly previousCloseId: string;
  readonly previousCloseSequence: number;
  readonly reopeningReason: string;
}

export interface JourneyClosingRepository {
  closeNormal(command: CloseJourneyCommand): Promise<ClosedJourney>;
  closeExceptional(command: ExceptionalCloseJourneyCommand): Promise<ClosedJourney>;
  closeCorrected(command: CloseJourneyCommand): Promise<ClosedJourney>;
  findPendingCorrection(): Promise<PendingJourneyCorrection | null>;
}

export interface ExceptionalCloseJourneyCommand extends CloseJourneyCommand {
  readonly currentBusinessDate: string;
}

export interface ExceptionalCloseJourneyInput extends CloseJourneyInput {
  readonly justification: string;
}

export class InvalidJourneyCloseRequestError extends Error {
  readonly code = 'INVALID_JOURNEY_CLOSE_REQUEST';
  constructor() {
    super('Los datos del cierre no son válidos.');
    this.name = 'InvalidJourneyCloseRequestError';
  }
}

export class JourneyCloseBlockedError extends Error {
  readonly code = 'JOURNEY_CLOSE_BLOCKED';
  constructor(readonly blockers: readonly string[]) {
    super('Existen elementos que impiden cerrar la jornada.');
    this.name = 'JourneyCloseBlockedError';
  }
}

export class JourneyCloseDifferenceJustificationRequiredError extends Error {
  readonly code = 'JOURNEY_CLOSE_JUSTIFICATION_REQUIRED';
  constructor() {
    super('La diferencia de efectivo requiere una justificación.');
    this.name = 'JourneyCloseDifferenceJustificationRequiredError';
  }
}

export class OpenJourneyToCloseRequiredError extends Error {
  readonly code = 'OPEN_JOURNEY_TO_CLOSE_REQUIRED';
  constructor() {
    super('No existe una jornada abierta para cerrar.');
    this.name = 'OpenJourneyToCloseRequiredError';
  }
}

export class JourneyCloseIdempotencyConflictError extends Error {
  readonly code = 'JOURNEY_CLOSE_IDEMPOTENCY_CONFLICT';
  constructor() {
    super('La solicitud de cierre ya se utilizó con datos diferentes.');
    this.name = 'JourneyCloseIdempotencyConflictError';
  }
}

export class CloseJourneyUseCase {
  constructor(
    private readonly repository: JourneyClosingRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly currentBusinessDate: () => string,
    private readonly nowUtc: () => string,
  ) {}

  execute(input: CloseJourneyInput): Promise<ClosedJourney> {
    this.authorization.assertCan(input.actor.role, 'CERRAR_JORNADA');
    if (
      !Number.isSafeInteger(input.actualCashCents) ||
      input.actualCashCents < 0 ||
      input.idempotencyKey.trim().length === 0
    ) {
      throw new InvalidJourneyCloseRequestError();
    }
    return this.repository.closeNormal({
      closeId: this.generateId(),
      auditId: this.generateId(),
      actualCashCents: input.actualCashCents,
      justification: optional(input.justification),
      idempotencyKey: input.idempotencyKey.trim(),
      actorUserId: input.actor.userId,
      closedAtUtc: this.nowUtc(),
      currentBusinessDate: this.currentBusinessDate(),
    });
  }
}

export class CloseExceptionalJourneyUseCase {
  constructor(
    private readonly repository: JourneyClosingRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly currentBusinessDate: () => string,
    private readonly nowUtc: () => string,
  ) {}

  execute(input: ExceptionalCloseJourneyInput): Promise<ClosedJourney> {
    this.authorization.assertCan(input.actor.role, 'REALIZAR_CIERRE_EXCEPCIONAL');
    const justification = optional(input.justification);
    if (
      !Number.isSafeInteger(input.actualCashCents) ||
      input.actualCashCents < 0 ||
      input.idempotencyKey.trim().length === 0 ||
      justification === null
    ) {
      throw new InvalidJourneyCloseRequestError();
    }
    return this.repository.closeExceptional({
      closeId: this.generateId(),
      auditId: this.generateId(),
      actualCashCents: input.actualCashCents,
      justification,
      idempotencyKey: input.idempotencyKey.trim(),
      actorUserId: input.actor.userId,
      closedAtUtc: this.nowUtc(),
      currentBusinessDate: this.currentBusinessDate(),
    });
  }
}

export class CloseCorrectedJourneyUseCase {
  constructor(
    private readonly repository: JourneyClosingRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly currentBusinessDate: () => string,
    private readonly nowUtc: () => string,
  ) {}

  execute(input: ExceptionalCloseJourneyInput): Promise<ClosedJourney> {
    this.authorization.assertCan(input.actor.role, 'CORREGIR_CIERRE');
    const justification = optional(input.justification);
    if (
      !Number.isSafeInteger(input.actualCashCents) ||
      input.actualCashCents < 0 ||
      input.idempotencyKey.trim().length === 0 ||
      justification === null
    ) {
      throw new InvalidJourneyCloseRequestError();
    }
    return this.repository.closeCorrected({
      closeId: this.generateId(),
      auditId: this.generateId(),
      actualCashCents: input.actualCashCents,
      justification,
      idempotencyKey: input.idempotencyKey.trim(),
      actorUserId: input.actor.userId,
      closedAtUtc: this.nowUtc(),
      currentBusinessDate: this.currentBusinessDate(),
    });
  }
}

export class GetPendingJourneyCorrectionUseCase {
  constructor(private readonly repository: JourneyClosingRepository) {}

  execute(): Promise<PendingJourneyCorrection | null> {
    return this.repository.findPendingCorrection();
  }
}

function optional(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}
