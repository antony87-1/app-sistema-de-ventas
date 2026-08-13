import { Inject, Injectable, InjectionToken } from '@angular/core';

import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { JOURNEY_REPORT_REPOSITORY } from '../../core/report/sqlite-journey-report.repository';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  GetJourneyReportUseCase,
  type JourneyReport,
  type JourneyReportRepository,
  type ReportJourney,
} from '../../domain/report/get-journey-report.use-case';

export interface ReportsFacadePort {
  listJourneys(): Promise<readonly ReportJourney[]>;
  load(journeyId: string): Promise<JourneyReport | null>;
}

export const REPORTS_FACADE = new InjectionToken<ReportsFacadePort>('REPORTS_FACADE');

@Injectable()
export class ReportsFacade implements ReportsFacadePort {
  constructor(
    private readonly connection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(JOURNEY_REPORT_REPOSITORY) private readonly repository: JourneyReportRepository,
  ) {}

  async listJourneys(): Promise<readonly ReportJourney[]> {
    await this.connection.initialize();
    return this.useCase().list(this.actor());
  }

  async load(journeyId: string): Promise<JourneyReport | null> {
    await this.connection.initialize();
    return this.useCase().get(journeyId, this.actor());
  }

  private useCase(): GetJourneyReportUseCase {
    return new GetJourneyReportUseCase(this.repository, this.authorization);
  }

  private actor() {
    const actor = this.session.current();
    if (!actor) throw new Error('ACTIVE_REPORT_SESSION_REQUIRED');
    return actor;
  }
}
