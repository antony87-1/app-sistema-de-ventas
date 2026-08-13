import {
  EvaluateJourneyCloseReadinessUseCase,
  type JourneyCloseBlockersRepository,
} from './evaluate-journey-close-readiness.use-case';

describe('EvaluateJourneyCloseReadinessUseCase', () => {
  const repository: JourneyCloseBlockersRepository = {
    listOperationalBlockers: vi.fn().mockResolvedValue({
      openTables: [{ operationId: 'account-1', operationCode: 'CTA-1', tableName: 'Mesa 4' }],
      pendingAccounts: [{ operationId: 'account-1', operationCode: 'CTA-1', balanceCents: 4000 }],
    }),
  };

  it('requires the cash count and reports every operational blocker', async () => {
    const result = await new EvaluateJourneyCloseReadinessUseCase(repository).execute({
      journeyId: 'journey-1',
      expectedCashCents: 10000,
      actualCashCents: null,
      justification: '',
    });

    expect(result.canClose).toBe(false);
    expect(result.blockers.map((blocker) => blocker.kind)).toEqual([
      'OPEN_TABLE',
      'PENDING_ACCOUNT',
      'CASH_COUNT_REQUIRED',
    ]);
  });

  it('requires justification when counted cash differs from expected cash', async () => {
    const emptyRepository: JourneyCloseBlockersRepository = {
      listOperationalBlockers: vi.fn().mockResolvedValue({ openTables: [], pendingAccounts: [] }),
    };
    const useCase = new EvaluateJourneyCloseReadinessUseCase(emptyRepository);

    const result = await useCase.execute({
      journeyId: 'journey-1',
      expectedCashCents: 10000,
      actualCashCents: 9500,
      justification: '  ',
    });

    expect(result.differenceType).toBe('FALTANTE');
    expect(result.differenceCents).toBe(500);
    expect(result.blockers).toEqual([
      { kind: 'UNJUSTIFIED_CASH_DIFFERENCE', differenceType: 'FALTANTE', differenceCents: 500 },
    ]);
  });

  it('allows closing when operations are clear and any difference is justified', async () => {
    const emptyRepository: JourneyCloseBlockersRepository = {
      listOperationalBlockers: vi.fn().mockResolvedValue({ openTables: [], pendingAccounts: [] }),
    };
    const result = await new EvaluateJourneyCloseReadinessUseCase(emptyRepository).execute({
      journeyId: 'journey-1',
      expectedCashCents: 10000,
      actualCashCents: 10500,
      justification: 'Sobrante verificado por el cajero',
    });

    expect(result.canClose).toBe(true);
    expect(result.differenceType).toBe('SOBRANTE');
    expect(result.blockers).toEqual([]);
  });
});
