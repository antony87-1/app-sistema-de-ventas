import { AuthorizationPolicy, type UserRole } from '../auth/authorization-policy';
import type { CatalogProductAvailability } from './list-sale-catalog.use-case';

export interface ProductAvailabilityActor {
  readonly userId: string;
  readonly role: UserRole;
}

export interface ChangeProductAvailabilityInput {
  readonly productId: string;
  readonly availability: CatalogProductAvailability;
  readonly actor: ProductAvailabilityActor;
}

export interface ProductAvailabilityChange {
  readonly productId: string;
  readonly availability: CatalogProductAvailability;
  readonly actorUserId: string;
  readonly auditId: string;
  readonly occurredAtUtc: string;
}

export interface ProductAvailabilityChangeResult {
  readonly productId: string;
  readonly previousAvailability: CatalogProductAvailability;
  readonly currentAvailability: CatalogProductAvailability;
  readonly changed: boolean;
}

export interface ProductAvailabilityRepository {
  change(change: ProductAvailabilityChange): Promise<ProductAvailabilityChangeResult>;
}

export class InvalidProductIdError extends Error {
  readonly code = 'INVALID_PRODUCT_ID';

  constructor() {
    super('El producto seleccionado no es válido.');
    this.name = 'InvalidProductIdError';
  }
}

export class ActiveProductNotFoundError extends Error {
  readonly code = 'ACTIVE_PRODUCT_NOT_FOUND';

  constructor() {
    super('El producto ya no está activo en el catálogo.');
    this.name = 'ActiveProductNotFoundError';
  }
}

export class ChangeProductAvailabilityUseCase {
  constructor(
    private readonly repository: ProductAvailabilityRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly nowUtc: () => string,
  ) {}

  async execute(input: ChangeProductAvailabilityInput): Promise<ProductAvailabilityChangeResult> {
    this.authorization.assertCan(input.actor.role, 'CAMBIAR_DISPONIBILIDAD_PRODUCTO');
    const productId = input.productId.trim();
    if (productId.length === 0) throw new InvalidProductIdError();

    return this.repository.change({
      productId,
      availability: input.availability,
      actorUserId: input.actor.userId,
      auditId: this.generateId(),
      occurredAtUtc: this.nowUtc(),
    });
  }
}
