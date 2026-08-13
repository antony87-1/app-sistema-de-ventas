import { Inject, Injectable, InjectionToken } from '@angular/core';

import { SALE_CATALOG_REPOSITORY } from '../../core/catalog/sqlite-sale-catalog.repository';
import { PRODUCT_AVAILABILITY_REPOSITORY } from '../../core/catalog/sqlite-product-availability.repository';
import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import { AuthorizationPolicy } from '../../domain/auth/authorization-policy';
import {
  ChangeProductAvailabilityUseCase,
  type ProductAvailabilityChangeResult,
  type ProductAvailabilityRepository,
} from '../../domain/catalog/change-product-availability.use-case';
import {
  type CatalogProductAvailability,
  ListSaleCatalogUseCase,
  type SaleCatalog,
  type SaleCatalogRepository,
} from '../../domain/catalog/list-sale-catalog.use-case';

export interface SaleCatalogFacadePort {
  load(): Promise<SaleCatalog>;
  changeAvailability(
    productId: string,
    availability: CatalogProductAvailability,
  ): Promise<ProductAvailabilityChangeResult>;
}

export const SALE_CATALOG_FACADE = new InjectionToken<SaleCatalogFacadePort>('SALE_CATALOG_FACADE');

@Injectable()
export class SaleCatalogFacade implements SaleCatalogFacadePort {
  constructor(
    private readonly databaseConnection: DatabaseConnectionService,
    private readonly session: SessionService,
    private readonly authorization: AuthorizationPolicy,
    @Inject(SALE_CATALOG_REPOSITORY) private readonly repository: SaleCatalogRepository,
    @Inject(PRODUCT_AVAILABILITY_REPOSITORY)
    private readonly availabilityRepository: ProductAvailabilityRepository,
  ) {}

  async load(): Promise<SaleCatalog> {
    await this.databaseConnection.initialize();
    return new ListSaleCatalogUseCase(this.repository).execute();
  }

  async changeAvailability(
    productId: string,
    availability: CatalogProductAvailability,
  ): Promise<ProductAvailabilityChangeResult> {
    await this.databaseConnection.initialize();
    const identity = this.session.current();
    if (identity === null) throw new ActiveCatalogSessionRequiredError();

    return new ChangeProductAvailabilityUseCase(
      this.availabilityRepository,
      this.authorization,
      generateIdentifier,
      () => new Date().toISOString(),
    ).execute({ productId, availability, actor: identity });
  }
}

export class ActiveCatalogSessionRequiredError extends Error {
  readonly code = 'ACTIVE_CATALOG_SESSION_REQUIRED';

  constructor() {
    super('Tu sesión terminó. Vuelve a iniciar sesión.');
    this.name = 'ActiveCatalogSessionRequiredError';
  }
}

function generateIdentifier(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
