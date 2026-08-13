import { AuthorizationPolicy, type UserRole } from '../auth/authorization-policy';
import {
  ChangeProductAvailabilityUseCase,
  type ProductAvailabilityRepository,
} from './change-product-availability.use-case';

describe('ChangeProductAvailabilityUseCase', () => {
  it.each<UserRole>(['ADMINISTRADOR', 'CAJERO'])(
    'allows %s to change availability with actor and audit metadata',
    async (role) => {
      const repository: ProductAvailabilityRepository = {
        change: vi.fn().mockResolvedValue({
          productId: 'product-1',
          previousAvailability: 'DISPONIBLE',
          currentAvailability: 'AGOTADO',
          changed: true,
        }),
      };
      const useCase = new ChangeProductAvailabilityUseCase(
        repository,
        new AuthorizationPolicy(),
        () => 'audit-1',
        () => '2026-07-29T23:00:00.000Z',
      );

      await useCase.execute({
        productId: 'product-1',
        availability: 'AGOTADO',
        actor: { userId: `user-${role}`, role },
      });

      expect(repository.change).toHaveBeenCalledWith({
        productId: 'product-1',
        availability: 'AGOTADO',
        actorUserId: `user-${role}`,
        auditId: 'audit-1',
        occurredAtUtc: '2026-07-29T23:00:00.000Z',
      });
    },
  );

  it('rejects an empty product identifier before persistence', async () => {
    const repository: ProductAvailabilityRepository = { change: vi.fn() };
    const useCase = new ChangeProductAvailabilityUseCase(
      repository,
      new AuthorizationPolicy(),
      () => 'audit-1',
      () => '2026-07-29T23:00:00.000Z',
    );

    await expect(
      useCase.execute({
        productId: '  ',
        availability: 'AGOTADO',
        actor: { userId: 'user-cashier', role: 'CAJERO' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PRODUCT_ID' });
    expect(repository.change).not.toHaveBeenCalled();
  });
});
