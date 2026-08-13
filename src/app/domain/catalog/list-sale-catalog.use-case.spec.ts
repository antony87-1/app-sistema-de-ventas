import {
  ListSaleCatalogUseCase,
  type SaleCatalog,
  type SaleCatalogRepository,
} from './list-sale-catalog.use-case';

describe('ListSaleCatalogUseCase', () => {
  it('returns the sale catalog supplied by its repository', async () => {
    const catalog: SaleCatalog = {
      categories: [{ code: 'KANKACHO', name: 'Kankacho', order: 1 }],
      products: [
        {
          id: 'product-1',
          code: 'KANKACHO_20',
          categoryCode: 'KANKACHO',
          name: 'Kankacho S/20',
          description: 'Porción normal',
          presentation: 'Normal',
          priceCents: 2000,
          availability: 'DISPONIBLE',
          allowsAddons: true,
          allowsPriceChange: true,
          currentImagePath: null,
        },
      ],
    };
    const repository: SaleCatalogRepository = { listForSale: vi.fn().mockResolvedValue(catalog) };

    await expect(new ListSaleCatalogUseCase(repository).execute()).resolves.toEqual(catalog);
    expect(repository.listForSale).toHaveBeenCalledOnce();
  });
});
