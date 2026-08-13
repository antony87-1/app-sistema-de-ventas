import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import type { ProductAvailabilityRepository } from '../../domain/catalog/change-product-availability.use-case';
import type { SaleCatalogRepository } from '../../domain/catalog/list-sale-catalog.use-case';
import { SaleCatalogFacade } from './catalog.facade';

describe('SaleCatalogFacade', () => {
  it('initializes SQLite before consulting the sale catalog', async () => {
    const events: string[] = [];
    const databaseConnection = {
      initialize: vi.fn().mockImplementation(async () => events.push('database-ready')),
    } as unknown as DatabaseConnectionService;
    const repository: SaleCatalogRepository = {
      listForSale: vi.fn().mockImplementation(async () => {
        events.push('catalog-read');
        return { categories: [], products: [] };
      }),
    };
    const availabilityRepository: ProductAvailabilityRepository = { change: vi.fn() };

    await expect(
      new SaleCatalogFacade(
        databaseConnection,
        new SessionService(),
        new AuthorizationPolicy(),
        repository,
        availabilityRepository,
      ).load(),
    ).resolves.toEqual({ categories: [], products: [] });
    expect(events).toEqual(['database-ready', 'catalog-read']);
  });

  it('uses the active identity when changing availability', async () => {
    const databaseConnection = {
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseConnectionService;
    const session = new SessionService();
    session.start({ userId: 'user-cashier', role: 'CAJERO', displayName: 'Caja' });
    const repository: SaleCatalogRepository = { listForSale: vi.fn() };
    const availabilityRepository: ProductAvailabilityRepository = {
      change: vi.fn().mockImplementation(async (change) => ({
        productId: change.productId,
        previousAvailability: 'DISPONIBLE',
        currentAvailability: change.availability,
        changed: true,
      })),
    };
    const facade = new SaleCatalogFacade(
      databaseConnection,
      session,
      new AuthorizationPolicy(),
      repository,
      availabilityRepository,
    );

    await facade.changeAvailability('product-1', 'AGOTADO');

    expect(availabilityRepository.change).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        availability: 'AGOTADO',
        actorUserId: 'user-cashier',
      }),
    );
  });
});
