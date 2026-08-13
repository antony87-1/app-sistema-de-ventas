export interface OpenTableBlockerData {
  readonly operationId: string;
  readonly operationCode: string;
  readonly tableName: string;
}

export interface PendingAccountBlockerData {
  readonly operationId: string;
  readonly operationCode: string;
  readonly balanceCents: number;
}

export interface OperationalCloseBlockers {
  readonly openTables: readonly OpenTableBlockerData[];
  readonly pendingAccounts: readonly PendingAccountBlockerData[];
}

export interface JourneyCloseBlockersRepository {
  listOperationalBlockers(journeyId: string): Promise<OperationalCloseBlockers>;
}

export type JourneyCloseBlocker =
  | ({ readonly kind: 'OPEN_TABLE' } & OpenTableBlockerData)
  | ({ readonly kind: 'PENDING_ACCOUNT' } & PendingAccountBlockerData)
  | { readonly kind: 'CASH_COUNT_REQUIRED' }
  | {
      readonly kind: 'UNJUSTIFIED_CASH_DIFFERENCE';
      readonly differenceType: 'SOBRANTE' | 'FALTANTE';
      readonly differenceCents: number;
    };

export interface JourneyCloseReadiness {
  readonly canClose: boolean;
  readonly actualCashCents: number | null;
  readonly differenceType: 'CUADRA' | 'SOBRANTE' | 'FALTANTE' | null;
  readonly differenceCents: number | null;
  readonly blockers: readonly JourneyCloseBlocker[];
}

export interface EvaluateJourneyCloseReadinessCommand {
  readonly journeyId: string;
  readonly expectedCashCents: number;
  readonly actualCashCents: number | null;
  readonly justification: string;
}

export class EvaluateJourneyCloseReadinessUseCase {
  constructor(private readonly repository: JourneyCloseBlockersRepository) {}

  async execute(command: EvaluateJourneyCloseReadinessCommand): Promise<JourneyCloseReadiness> {
    const operational = await this.repository.listOperationalBlockers(command.journeyId);
    const blockers: JourneyCloseBlocker[] = [
      ...operational.openTables.map((table) => ({ kind: 'OPEN_TABLE' as const, ...table })),
      ...operational.pendingAccounts.map((account) => ({
        kind: 'PENDING_ACCOUNT' as const,
        ...account,
      })),
    ];

    if (command.actualCashCents === null) {
      blockers.push({ kind: 'CASH_COUNT_REQUIRED' });
      return {
        canClose: false,
        actualCashCents: null,
        differenceType: null,
        differenceCents: null,
        blockers,
      };
    }

    const signedDifference = command.actualCashCents - command.expectedCashCents;
    const differenceCents = Math.abs(signedDifference);
    const differenceType =
      signedDifference === 0 ? 'CUADRA' : signedDifference > 0 ? 'SOBRANTE' : 'FALTANTE';
    if (differenceCents > 0 && command.justification.trim().length === 0) {
      const nonZeroDifferenceType = signedDifference > 0 ? 'SOBRANTE' : 'FALTANTE';
      blockers.push({
        kind: 'UNJUSTIFIED_CASH_DIFFERENCE',
        differenceType: nonZeroDifferenceType,
        differenceCents,
      });
    }

    return {
      canClose: blockers.length === 0,
      actualCashCents: command.actualCashCents,
      differenceType,
      differenceCents,
      blockers,
    };
  }
}
