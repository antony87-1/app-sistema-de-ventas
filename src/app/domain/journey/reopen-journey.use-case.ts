import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface ReopenCandidate {
  readonly journeyId: string;
  readonly businessDate: string;
  readonly closeId: string;
  readonly closeType: 'NORMAL' | 'EXCEPCIONAL' | 'CORREGIDO';
  readonly closedAtUtc: string;
}
export interface ReopenedJourney extends ReopenCandidate {
  readonly reopeningId: string;
  readonly reason: string;
  readonly reopenedByUserId: string;
  readonly reopenedAtUtc: string;
}
export interface JourneyReopeningCommand {
  readonly reopeningId: string;
  readonly auditId: string;
  readonly closeId: string;
  readonly reason: string;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly reopenedAtUtc: string;
}
export interface JourneyReopeningRepository {
  findLatestCandidate(): Promise<ReopenCandidate | null>;
  reopen(command: JourneyReopeningCommand): Promise<ReopenedJourney>;
}
export class InvalidJourneyReopeningRequestError extends Error {
  readonly code = 'INVALID_JOURNEY_REOPENING_REQUEST';
}
export class JourneyReopeningIdempotencyConflictError extends Error {
  readonly code = 'JOURNEY_REOPENING_IDEMPOTENCY_CONFLICT';
}
export class ReopenJourneyUseCase {
  constructor(
    private readonly repository: JourneyReopeningRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly nowUtc: () => string,
  ) {}
  execute(input: {
    candidate: ReopenCandidate;
    reason: string;
    idempotencyKey: string;
    actor: AuthenticatedIdentity;
  }): Promise<ReopenedJourney> {
    this.authorization.assertCan(input.actor.role, 'REABRIR_JORNADA');
    const reason = input.reason.trim();
    const key = input.idempotencyKey.trim();
    if (reason.length === 0 || key.length === 0) throw new InvalidJourneyReopeningRequestError();
    return this.repository.reopen({
      reopeningId: this.generateId(),
      auditId: this.generateId(),
      closeId: input.candidate.closeId,
      reason,
      actorUserId: input.actor.userId,
      idempotencyKey: key,
      reopenedAtUtc: this.nowUtc(),
    });
  }
}
