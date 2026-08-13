import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface PendingQuickSaleAddon {
  readonly detailId: string;
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly priceCents: number;
}

export interface PendingQuickSaleLine {
  readonly detailId: string;
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly priceCents: number;
  readonly catalogPriceCents: number;
  readonly priceAdjustment: {
    readonly type: 'DESCUENTO' | 'PRECIO_PERSONALIZADO';
    readonly reason: string;
  } | null;
  readonly addons: readonly PendingQuickSaleAddon[];
}

export interface PendingQuickSale {
  readonly operationId: string;
  readonly operationCode: string;
  readonly totalCents: number;
  readonly createdAtUtc: string;
  readonly lines: readonly PendingQuickSaleLine[];
}

export interface PendingQuickSalesRepository {
  list(): Promise<readonly PendingQuickSale[]>;
}

export class ListPendingQuickSalesUseCase {
  constructor(
    private readonly repository: PendingQuickSalesRepository,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  execute(actor: AuthenticatedIdentity): Promise<readonly PendingQuickSale[]> {
    this.authorization.assertCan(actor.role, 'CONSULTAR_OPERACIONES_DIA');
    return this.repository.list();
  }
}
