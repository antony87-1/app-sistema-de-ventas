export interface CashMethodSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly inflowCents: number;
  readonly outflowCents: number;
  readonly netCents: number;
}

export interface OpenCashSummary {
  readonly journeyId: string;
  readonly businessDate: string;
  readonly initialCashCents: number;
  readonly expectedCashCents: number;
  readonly methods: readonly CashMethodSummary[];
}

export interface CashSummaryRepository {
  findOpen(): Promise<OpenCashSummary | null>;
}

export class GetOpenCashSummaryUseCase {
  constructor(private readonly repository: CashSummaryRepository) {}

  execute(): Promise<OpenCashSummary | null> {
    return this.repository.findOpen();
  }
}
