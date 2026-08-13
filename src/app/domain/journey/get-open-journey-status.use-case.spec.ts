import {
  GetOpenJourneyStatusUseCase,
  type OpenJourney,
  type OpenJourneyRepository,
} from './get-open-journey-status.use-case';

const OPEN_JOURNEY: OpenJourney = {
  id: 'journey-1',
  businessDate: '2026-07-29',
  initialAmountCents: 10000,
  openedByUserId: 'user-cashier',
  openedByDisplayName: 'Caja',
  openedAtUtc: '2026-07-29T14:00:00.000Z',
};

describe('GetOpenJourneyStatusUseCase', () => {
  it('reports when there is no open journey', async () => {
    const repository: OpenJourneyRepository = { findOpen: vi.fn().mockResolvedValue(null) };

    await expect(
      new GetOpenJourneyStatusUseCase(repository, () => '2026-07-29').execute(),
    ).resolves.toEqual({ kind: 'NONE', currentBusinessDate: '2026-07-29' });
  });

  it('identifies an open journey for the current Lima business date', async () => {
    const repository: OpenJourneyRepository = {
      findOpen: vi.fn().mockResolvedValue(OPEN_JOURNEY),
    };

    await expect(
      new GetOpenJourneyStatusUseCase(repository, () => '2026-07-29').execute(),
    ).resolves.toEqual({
      kind: 'OPEN_TODAY',
      currentBusinessDate: '2026-07-29',
      journey: OPEN_JOURNEY,
    });
  });

  it('identifies an earlier open journey that must block a new day', async () => {
    const repository: OpenJourneyRepository = {
      findOpen: vi.fn().mockResolvedValue(OPEN_JOURNEY),
    };

    await expect(
      new GetOpenJourneyStatusUseCase(repository, () => '2026-07-30').execute(),
    ).resolves.toMatchObject({ kind: 'OPEN_PREVIOUS_DAY', journey: OPEN_JOURNEY });
  });

  it('classifies a future open date as a blocking clock inconsistency', async () => {
    const repository: OpenJourneyRepository = {
      findOpen: vi.fn().mockResolvedValue(OPEN_JOURNEY),
    };

    await expect(
      new GetOpenJourneyStatusUseCase(repository, () => '2026-07-28').execute(),
    ).resolves.toMatchObject({ kind: 'OPEN_FUTURE_DAY', journey: OPEN_JOURNEY });
  });

  it('rejects malformed business dates instead of comparing ambiguous text', async () => {
    for (const invalidDate of ['29/07/2026', '2026-02-30']) {
      const repository: OpenJourneyRepository = {
        findOpen: vi.fn().mockResolvedValue({ ...OPEN_JOURNEY, businessDate: invalidDate }),
      };

      await expect(
        new GetOpenJourneyStatusUseCase(repository, () => '2026-07-29').execute(),
      ).rejects.toMatchObject({ code: 'INVALID_BUSINESS_DATE' });
    }
  });
});
