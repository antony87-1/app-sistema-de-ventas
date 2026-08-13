import { Inject, Injectable, InjectionToken } from '@angular/core';

import { SessionService } from '../../core/auth/session.service';
import { CASH_SUMMARY_REPOSITORY } from '../../core/cash/sqlite-cash-summary.repository';
import { JOURNEY_CLOSE_BLOCKERS_REPOSITORY } from '../../core/cash/sqlite-journey-close-blockers.repository';
import { JOURNEY_CLOSING_REPOSITORY } from '../../core/cash/sqlite-journey-closing.repository';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { currentLimaBusinessDate } from '../../core/time/lima-business-date';
import { EXPENSE_FORM_OPTIONS_REPOSITORY } from '../../core/expense/sqlite-expense-form-options.repository';
import { EXPENSE_REGISTRATION_REPOSITORY } from '../../core/expense/sqlite-expense-registration.repository';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  GetOpenCashSummaryUseCase,
  type CashSummaryRepository,
  type OpenCashSummary,
} from '../../domain/cash/get-open-cash-summary.use-case';
import {
  EvaluateJourneyCloseReadinessUseCase,
  type JourneyCloseBlockersRepository,
  type JourneyCloseReadiness,
} from '../../domain/cash/evaluate-journey-close-readiness.use-case';
import {
  CloseJourneyUseCase,
  CloseExceptionalJourneyUseCase,
  CloseCorrectedJourneyUseCase,
  GetPendingJourneyCorrectionUseCase,
  type ClosedJourney,
  type JourneyClosingRepository,
  type PendingJourneyCorrection,
} from '../../domain/cash/close-journey.use-case';
import {
  ListExpenseFormOptionsUseCase,
  type ExpenseFormOptions,
  type ExpenseFormOptionsRepository,
} from '../../domain/expense/list-expense-form-options.use-case';
import {
  RegisterExpenseUseCase,
  type ExpenseRegistrationRepository,
  type RegisteredExpense,
} from '../../domain/expense/register-expense.use-case';

export interface ExpenseRegistrationDraft {
  readonly categoryId: string;
  readonly paymentMethodId: string;
  readonly description: string;
  readonly amountCents: number;
  readonly supplier: string | null;
  readonly note: string | null;
}

export interface ExpenseFacadePort {
  loadOptions(): Promise<ExpenseFormOptions>;
  loadCashSummary(): Promise<OpenCashSummary | null>;
  loadCloseReadiness(
    actualCashCents: number | null,
    justification: string,
  ): Promise<JourneyCloseReadiness | null>;
  closeJourney(
    actualCashCents: number,
    justification: string | null,
    idempotencyKey: string,
  ): Promise<ClosedJourney>;
  newClosingRequestKey(): string;
  canPerformExceptionalClose(): boolean;
  closeExceptionalJourney(
    actualCashCents: number,
    justification: string,
    idempotencyKey: string,
  ): Promise<ClosedJourney>;
  loadPendingCorrection(): Promise<PendingJourneyCorrection | null>;
  canCorrectClose(): boolean;
  closeCorrectedJourney(
    actualCashCents: number,
    justification: string,
    idempotencyKey: string,
  ): Promise<ClosedJourney>;
  register(draft: ExpenseRegistrationDraft, idempotencyKey: string): Promise<RegisteredExpense>;
  newRegistrationRequestKey(): string;
}

export const EXPENSE_FACADE = new InjectionToken<ExpenseFacadePort>('EXPENSE_FACADE');

@Injectable()
export class ExpenseFacade implements ExpenseFacadePort {
  constructor(
    private readonly databaseConnection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(CASH_SUMMARY_REPOSITORY)
    private readonly cashSummaryRepository: CashSummaryRepository,
    @Inject(JOURNEY_CLOSE_BLOCKERS_REPOSITORY)
    private readonly closeBlockersRepository: JourneyCloseBlockersRepository,
    @Inject(JOURNEY_CLOSING_REPOSITORY)
    private readonly closingRepository: JourneyClosingRepository,
    @Inject(EXPENSE_FORM_OPTIONS_REPOSITORY)
    private readonly optionsRepository: ExpenseFormOptionsRepository,
    @Inject(EXPENSE_REGISTRATION_REPOSITORY)
    private readonly registrationRepository: ExpenseRegistrationRepository,
  ) {}

  async loadOptions(): Promise<ExpenseFormOptions> {
    await this.databaseConnection.initialize();
    return new ListExpenseFormOptionsUseCase(this.optionsRepository).execute();
  }

  async loadCashSummary(): Promise<OpenCashSummary | null> {
    await this.databaseConnection.initialize();
    return new GetOpenCashSummaryUseCase(this.cashSummaryRepository).execute();
  }

  async loadCloseReadiness(
    actualCashCents: number | null,
    justification: string,
  ): Promise<JourneyCloseReadiness | null> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveExpenseSessionRequiredError();
    this.authorization.assertCan(actor.role, 'CERRAR_JORNADA');
    const summary = await new GetOpenCashSummaryUseCase(this.cashSummaryRepository).execute();
    if (summary === null) return null;
    return new EvaluateJourneyCloseReadinessUseCase(this.closeBlockersRepository).execute({
      journeyId: summary.journeyId,
      expectedCashCents: summary.expectedCashCents,
      actualCashCents,
      justification,
    });
  }

  async closeJourney(
    actualCashCents: number,
    justification: string | null,
    idempotencyKey: string,
  ): Promise<ClosedJourney> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveExpenseSessionRequiredError();
    return new CloseJourneyUseCase(
      this.closingRepository,
      this.authorization,
      generateIdentifier,
      currentLimaBusinessDate,
      () => new Date().toISOString(),
    ).execute({ actualCashCents, justification, idempotencyKey, actor });
  }

  newClosingRequestKey(): string {
    return generateIdentifier();
  }

  canPerformExceptionalClose(): boolean {
    const actor = this.session.current();
    return actor !== null && this.authorization.can(actor.role, 'REALIZAR_CIERRE_EXCEPCIONAL');
  }

  async closeExceptionalJourney(
    actualCashCents: number,
    justification: string,
    idempotencyKey: string,
  ): Promise<ClosedJourney> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveExpenseSessionRequiredError();
    return new CloseExceptionalJourneyUseCase(
      this.closingRepository,
      this.authorization,
      generateIdentifier,
      currentLimaBusinessDate,
      () => new Date().toISOString(),
    ).execute({ actualCashCents, justification, idempotencyKey, actor });
  }

  async loadPendingCorrection(): Promise<PendingJourneyCorrection | null> {
    await this.databaseConnection.initialize();
    return new GetPendingJourneyCorrectionUseCase(this.closingRepository).execute();
  }

  canCorrectClose(): boolean {
    const actor = this.session.current();
    return actor !== null && this.authorization.can(actor.role, 'CORREGIR_CIERRE');
  }

  async closeCorrectedJourney(
    actualCashCents: number,
    justification: string,
    idempotencyKey: string,
  ): Promise<ClosedJourney> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveExpenseSessionRequiredError();
    return new CloseCorrectedJourneyUseCase(
      this.closingRepository,
      this.authorization,
      generateIdentifier,
      currentLimaBusinessDate,
      () => new Date().toISOString(),
    ).execute({ actualCashCents, justification, idempotencyKey, actor });
  }

  async register(
    draft: ExpenseRegistrationDraft,
    idempotencyKey: string,
  ): Promise<RegisteredExpense> {
    await this.databaseConnection.initialize();
    const actor = this.session.current();
    if (actor === null) throw new ActiveExpenseSessionRequiredError();

    return new RegisterExpenseUseCase(
      this.registrationRepository,
      this.authorization,
      generateIdentifier,
      () => new Date().toISOString(),
    ).execute({ ...draft, idempotencyKey, actor });
  }

  newRegistrationRequestKey(): string {
    return generateIdentifier();
  }
}

export class ActiveExpenseSessionRequiredError extends Error {
  readonly code = 'ACTIVE_EXPENSE_SESSION_REQUIRED';

  constructor() {
    super('Tu sesión terminó. Vuelve a iniciar sesión.');
    this.name = 'ActiveExpenseSessionRequiredError';
  }
}

function generateIdentifier(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
