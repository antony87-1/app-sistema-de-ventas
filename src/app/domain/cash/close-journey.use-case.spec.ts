import { AuthorizationPolicy } from '../auth/authorization-policy';
import {
  CloseCorrectedJourneyUseCase,
  CloseJourneyUseCase,
  type JourneyClosingRepository,
} from './close-journey.use-case';

describe('CloseJourneyUseCase', () => {
  it('allows a cashier and normalizes the optional justification', async () => {
    const repository: JourneyClosingRepository = {
      closeNormal: vi.fn().mockResolvedValue({}),
      closeExceptional: vi.fn().mockResolvedValue({}),
      closeCorrected: vi.fn().mockResolvedValue({}),
      findPendingCorrection: vi.fn().mockResolvedValue(null),
    };
    await new CloseJourneyUseCase(
      repository,
      new AuthorizationPolicy(),
      () => 'id',
      () => '2026-07-29',
      () => 'now',
    ).execute({
      actualCashCents: 10000,
      justification: '  ',
      idempotencyKey: ' close-key ',
      actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
    });
    expect(repository.closeNormal).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCashCents: 10000,
        justification: null,
        idempotencyKey: 'close-key',
        actorUserId: 'cashier',
      }),
    );
  });

  it('allows only an administrator to request a corrected close with a reason', async () => {
    const repository: JourneyClosingRepository = {
      closeNormal: vi.fn().mockResolvedValue({}),
      closeExceptional: vi.fn().mockResolvedValue({}),
      closeCorrected: vi.fn().mockResolvedValue({}),
      findPendingCorrection: vi.fn().mockResolvedValue(null),
    };
    const useCase = new CloseCorrectedJourneyUseCase(
      repository,
      new AuthorizationPolicy(),
      () => 'id',
      () => '2026-07-29',
      () => 'now',
    );
    await useCase.execute({
      actualCashCents: 10000,
      justification: '  Rectificar conteo  ',
      idempotencyKey: ' corrected-key ',
      actor: { userId: 'admin', displayName: 'Admin', role: 'ADMINISTRADOR' },
    });
    expect(repository.closeCorrected).toHaveBeenCalledWith(
      expect.objectContaining({
        justification: 'Rectificar conteo',
        idempotencyKey: 'corrected-key',
        actorUserId: 'admin',
      }),
    );
    expect(() =>
      useCase.execute({
        actualCashCents: 10000,
        justification: 'Rectificar conteo',
        idempotencyKey: 'other-key',
        actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
      }),
    ).toThrow();
  });
});
