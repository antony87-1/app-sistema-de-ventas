import { Inject, Injectable, InjectionToken } from '@angular/core';

import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { JOURNEY_OPENING_REPOSITORY } from '../../core/journey/sqlite-journey-opening.repository';
import { OPEN_JOURNEY_REPOSITORY } from '../../core/journey/sqlite-open-journey.repository';
import { JOURNEY_REOPENING_REPOSITORY } from '../../core/journey/sqlite-journey-reopening.repository';
import { currentLimaBusinessDate } from '../../core/time/lima-business-date';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  GetOpenJourneyStatusUseCase,
  type OpenJourney,
  type OpenJourneyRepository,
  type OpenJourneyStatus,
} from '../../domain/journey/get-open-journey-status.use-case';
import {
  OpenJourneyUseCase,
  type JourneyOpeningRepository,
} from '../../domain/journey/open-journey.use-case';
import {
  ReopenJourneyUseCase,
  type JourneyReopeningRepository,
  type ReopenCandidate,
  type ReopenedJourney,
} from '../../domain/journey/reopen-journey.use-case';

export interface JourneyFacadePort {
  getStatus(): Promise<OpenJourneyStatus>;
  open(
    initialAmountCents: number,
    observation: string | null,
    idempotencyKey: string,
  ): Promise<OpenJourney>;
  newOpeningRequestKey(): string;
  canReopenJourney(): boolean;
  getReopenCandidate(): Promise<ReopenCandidate | null>;
  reopen(
    candidate: ReopenCandidate,
    reason: string,
    idempotencyKey: string,
  ): Promise<ReopenedJourney>;
}

export const JOURNEY_FACADE = new InjectionToken<JourneyFacadePort>('JOURNEY_FACADE');

@Injectable()
export class JourneyFacade implements JourneyFacadePort {
  constructor(
    private readonly databaseConnection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(OPEN_JOURNEY_REPOSITORY) private readonly openJourneyReader: OpenJourneyRepository,
    @Inject(JOURNEY_OPENING_REPOSITORY)
    private readonly journeyOpening: JourneyOpeningRepository,
    @Inject(JOURNEY_REOPENING_REPOSITORY)
    private readonly journeyReopening: JourneyReopeningRepository,
  ) {}

  async getStatus(): Promise<OpenJourneyStatus> {
    await this.databaseConnection.initialize();
    return new GetOpenJourneyStatusUseCase(
      this.openJourneyReader,
      currentLimaBusinessDate,
    ).execute();
  }

  async open(
    initialAmountCents: number,
    observation: string | null,
    idempotencyKey: string,
  ): Promise<OpenJourney> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveJourneySessionRequiredError();

    return new OpenJourneyUseCase(
      this.journeyOpening,
      this.authorization,
      generateIdentifier,
      currentLimaBusinessDate,
      () => new Date().toISOString(),
    ).execute({ initialAmountCents, observation, idempotencyKey, actor });
  }

  newOpeningRequestKey(): string {
    return generateIdentifier();
  }
  canReopenJourney(): boolean {
    const actor = this.session.current();
    return actor !== null && this.authorization.can(actor.role, 'REABRIR_JORNADA');
  }
  async getReopenCandidate(): Promise<ReopenCandidate | null> {
    await this.databaseConnection.initialize();
    return this.journeyReopening.findLatestCandidate();
  }
  async reopen(
    candidate: ReopenCandidate,
    reason: string,
    idempotencyKey: string,
  ): Promise<ReopenedJourney> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveJourneySessionRequiredError();
    return new ReopenJourneyUseCase(
      this.journeyReopening,
      this.authorization,
      generateIdentifier,
      () => new Date().toISOString(),
    ).execute({ candidate, reason, idempotencyKey, actor });
  }
}

export class ActiveJourneySessionRequiredError extends Error {
  readonly code = 'ACTIVE_JOURNEY_SESSION_REQUIRED';

  constructor() {
    super('Tu sesión terminó. Vuelve a iniciar sesión.');
    this.name = 'ActiveJourneySessionRequiredError';
  }
}

function generateIdentifier(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
