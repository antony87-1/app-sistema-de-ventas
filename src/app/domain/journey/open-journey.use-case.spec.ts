import { AuthorizationPolicy, type UserRole } from '../auth/authorization-policy';
import {
  InvalidInitialAmountError,
  InvalidJourneyOpeningRequestError,
  OpenJourneyUseCase,
  type JourneyOpeningRepository,
} from './open-journey.use-case';

const NOW = '2026-07-29T23:00:00.000Z';

describe('OpenJourneyUseCase', () => {
  it.each<UserRole>(['ADMINISTRADOR', 'CAJERO'])(
    'allows %s to open a normal journey with complete metadata',
    async (role) => {
      const repository: JourneyOpeningRepository = {
        open: vi.fn().mockResolvedValue({
          id: 'journey-1',
          businessDate: '2026-07-29',
          initialAmountCents: 15000,
          openedByUserId: 'user-1',
          openedByDisplayName: 'Caja',
          openedAtUtc: NOW,
        }),
      };
      const ids = ['journey-1', 'audit-1'];
      const useCase = new OpenJourneyUseCase(
        repository,
        new AuthorizationPolicy(),
        () => ids.shift() ?? 'unexpected-id',
        () => '2026-07-29',
        () => NOW,
      );

      await useCase.execute({
        initialAmountCents: 15000,
        observation: '  Turno de la tarde  ',
        idempotencyKey: '  request-1  ',
        actor: { userId: 'user-1', displayName: 'Caja', role },
      });

      expect(repository.open).toHaveBeenCalledWith({
        journeyId: 'journey-1',
        auditId: 'audit-1',
        businessDate: '2026-07-29',
        initialAmountCents: 15000,
        observation: 'Turno de la tarde',
        idempotencyKey: 'request-1',
        actorUserId: 'user-1',
        openedAtUtc: NOW,
      });
    },
  );

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid initial amount (%s) before persistence',
    async (initialAmountCents) => {
      const repository: JourneyOpeningRepository = { open: vi.fn() };
      const useCase = createUseCase(repository);

      await expect(
        useCase.execute({
          initialAmountCents,
          idempotencyKey: 'request-1',
          actor: { userId: 'user-1', displayName: 'Caja', role: 'CAJERO' },
        }),
      ).rejects.toBeInstanceOf(InvalidInitialAmountError);
      expect(repository.open).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty idempotency key before persistence', async () => {
    const repository: JourneyOpeningRepository = { open: vi.fn() };
    const useCase = createUseCase(repository);

    await expect(
      useCase.execute({
        initialAmountCents: 0,
        idempotencyKey: '   ',
        actor: { userId: 'user-1', displayName: 'Caja', role: 'CAJERO' },
      }),
    ).rejects.toBeInstanceOf(InvalidJourneyOpeningRequestError);
    expect(repository.open).not.toHaveBeenCalled();
  });

  it('normalizes a blank observation to null and accepts a zero initial amount', async () => {
    const repository: JourneyOpeningRepository = {
      open: vi.fn().mockResolvedValue({
        id: 'journey-1',
        businessDate: '2026-07-29',
        initialAmountCents: 0,
        openedByUserId: 'user-1',
        openedByDisplayName: 'Caja',
        openedAtUtc: NOW,
      }),
    };

    await createUseCase(repository).execute({
      initialAmountCents: 0,
      observation: '   ',
      idempotencyKey: 'request-1',
      actor: { userId: 'user-1', displayName: 'Caja', role: 'CAJERO' },
    });

    expect(repository.open).toHaveBeenCalledWith(expect.objectContaining({ observation: null }));
  });
});

function createUseCase(repository: JourneyOpeningRepository): OpenJourneyUseCase {
  const ids = ['journey-1', 'audit-1'];
  return new OpenJourneyUseCase(
    repository,
    new AuthorizationPolicy(),
    () => ids.shift() ?? 'unexpected-id',
    () => '2026-07-29',
    () => NOW,
  );
}
