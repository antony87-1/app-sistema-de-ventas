import {
  GetOpenCashSummaryUseCase,
  type CashSummaryRepository,
} from './get-open-cash-summary.use-case';

describe('GetOpenCashSummaryUseCase', () => {
  it('returns the open journey summary without changing persisted values', async () => {
    const summary = {
      journeyId: 'journey-1',
      businessDate: '2026-07-29',
      initialCashCents: 10000,
      expectedCashCents: 12500,
      methods: [
        {
          id: 'cash',
          code: 'EFECTIVO',
          name: 'Efectivo',
          inflowCents: 5000,
          outflowCents: 2500,
          netCents: 2500,
        },
      ],
    } as const;
    const repository: CashSummaryRepository = { findOpen: vi.fn().mockResolvedValue(summary) };

    await expect(new GetOpenCashSummaryUseCase(repository).execute()).resolves.toEqual(summary);
    expect(repository.findOpen).toHaveBeenCalledOnce();
  });
});
