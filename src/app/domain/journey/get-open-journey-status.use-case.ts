export interface OpenJourney {
  readonly id: string;
  readonly businessDate: string;
  readonly initialAmountCents: number;
  readonly openedByUserId: string;
  readonly openedByDisplayName: string;
  readonly openedAtUtc: string;
}

export interface OpenJourneyRepository {
  findOpen(): Promise<OpenJourney | null>;
}

export type OpenJourneyStatus =
  | { readonly kind: 'NONE'; readonly currentBusinessDate: string }
  | {
      readonly kind: 'OPEN_TODAY' | 'OPEN_PREVIOUS_DAY' | 'OPEN_FUTURE_DAY';
      readonly currentBusinessDate: string;
      readonly journey: OpenJourney;
    };

export class InvalidBusinessDateError extends Error {
  readonly code = 'INVALID_BUSINESS_DATE';

  constructor() {
    super('La fecha de la jornada no es válida.');
    this.name = 'InvalidBusinessDateError';
  }
}

export class GetOpenJourneyStatusUseCase {
  constructor(
    private readonly repository: OpenJourneyRepository,
    private readonly currentBusinessDate: () => string,
  ) {}

  async execute(): Promise<OpenJourneyStatus> {
    const currentBusinessDate = this.currentBusinessDate();
    assertBusinessDate(currentBusinessDate);
    const journey = await this.repository.findOpen();

    if (journey === null) return { kind: 'NONE', currentBusinessDate };
    assertBusinessDate(journey.businessDate);

    if (journey.businessDate === currentBusinessDate) {
      return { kind: 'OPEN_TODAY', currentBusinessDate, journey };
    }
    if (journey.businessDate < currentBusinessDate) {
      return { kind: 'OPEN_PREVIOUS_DAY', currentBusinessDate, journey };
    }
    return { kind: 'OPEN_FUTURE_DAY', currentBusinessDate, journey };
  }
}

export function assertBusinessDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new InvalidBusinessDateError();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new InvalidBusinessDateError();
  }
}
