export type CatalogProductAvailability = 'DISPONIBLE' | 'AGOTADO';

export interface SaleCatalogCategory {
  readonly code: string;
  readonly name: string;
  readonly order: number;
}

export interface SaleCatalogProduct {
  readonly id: string;
  readonly code: string;
  readonly categoryCode: string;
  readonly name: string;
  readonly description: string | null;
  readonly presentation: string | null;
  readonly priceCents: number;
  readonly availability: CatalogProductAvailability;
  readonly allowsAddons: boolean;
  readonly allowsPriceChange: boolean;
  readonly currentImagePath: string | null;
}

export interface SaleCatalog {
  readonly categories: readonly SaleCatalogCategory[];
  readonly products: readonly SaleCatalogProduct[];
  readonly addons?: readonly SaleCatalogAddon[];
}

export interface SaleCatalogAddon {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly priceCents: number;
  readonly availability: CatalogProductAvailability;
}

export interface SaleCatalogRepository {
  listForSale(): Promise<SaleCatalog>;
}

export class ListSaleCatalogUseCase {
  constructor(private readonly repository: SaleCatalogRepository) {}

  execute(): Promise<SaleCatalog> {
    return this.repository.listForSale();
  }
}
