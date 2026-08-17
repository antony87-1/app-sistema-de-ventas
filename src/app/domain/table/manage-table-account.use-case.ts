import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';
import type {
  QuickSaleLineInput,
  QuickSalePriceAdjustmentInput,
} from '../sale/create-quick-sale.use-case';

export interface TableAccountAddonLine {
  readonly detailId: string;
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly servedQuantity: number;
  readonly paidQuantity: number;
  readonly unitPriceCents: number;
  readonly subtotalCents: number;
  readonly serviceState: 'PENDIENTE' | 'SERVIDO';
}
export interface TableAccountLine extends TableAccountAddonLine {
  readonly catalogUnitPriceCents: number;
  readonly allowsAddons: boolean;
  readonly allowsPriceChange: boolean;
  readonly priceAdjustment: {
    readonly type: 'DESCUENTO' | 'PRECIO_PERSONALIZADO';
    readonly reason: string;
  } | null;
  readonly addons: readonly TableAccountAddonLine[];
}
export interface TableAccountSnapshot {
  readonly operationId: string;
  readonly operationCode: string;
  readonly state: 'ABIERTA' | 'PAGADA_PARCIALMENTE' | 'PAGADA';
  readonly totalCents: number;
  readonly paidCents: number;
  readonly balanceCents: number;
  readonly principalTableId: string;
  readonly principalTableName: string;
  readonly linkedTables: readonly { id: string; name: string }[];
  readonly lines: readonly TableAccountLine[];
}
export interface TableAccountMutationCommand {
  readonly operationId: string;
  readonly detailId?: string;
  readonly targetQuantity?: number;
  readonly tableId?: string;
  readonly addonProductId?: string;
  readonly priceAdjustment?: QuickSalePriceAdjustmentInput | null;
  readonly lines?: readonly QuickSaleLineInput[];
  readonly generatedDetailIds?: readonly { principalId: string; addonIds: readonly string[] }[];
  readonly requestKey: string;
  readonly actorUserId: string;
  readonly occurredAtUtc: string;
}
export interface TableAccountManagementRepository {
  load(operationId: string): Promise<TableAccountSnapshot>;
  add(command: TableAccountMutationCommand): Promise<TableAccountSnapshot>;
  addAddon(command: TableAccountMutationCommand): Promise<TableAccountSnapshot>;
  changeQuantity(command: TableAccountMutationCommand): Promise<TableAccountSnapshot>;
  changePrice(command: TableAccountMutationCommand): Promise<TableAccountSnapshot>;
  markServed(command: TableAccountMutationCommand): Promise<TableAccountSnapshot>;
  linkTable(command: TableAccountMutationCommand): Promise<TableAccountSnapshot>;
  unlinkTable(command: TableAccountMutationCommand): Promise<TableAccountSnapshot>;
}
export class InvalidTableAccountMutationError extends Error {
  readonly code = 'INVALID_TABLE_ACCOUNT_MUTATION';
}
export class TableAccountLockedError extends Error {
  readonly code = 'TABLE_ACCOUNT_LOCKED';
}
export class TableDetailLockedError extends Error {
  readonly code = 'TABLE_DETAIL_LOCKED';
}
export class TableLinkUnavailableError extends Error {
  readonly code = 'TABLE_LINK_UNAVAILABLE';
}
export class TableAccountMutationIdempotencyConflictError extends Error {
  readonly code = 'TABLE_ACCOUNT_MUTATION_IDEMPOTENCY_CONFLICT';
}

export class ManageTableAccountUseCase {
  constructor(
    private readonly repository: TableAccountManagementRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly nowUtc: () => string,
  ) {}
  load(operationId: string, actor: AuthenticatedIdentity): Promise<TableAccountSnapshot> {
    this.authorization.assertCan(actor.role, 'CONSULTAR_OPERACIONES_DIA');
    if (!operationId.trim()) throw new InvalidTableAccountMutationError();
    return this.repository.load(operationId.trim());
  }
  add(
    operationId: string,
    lines: readonly QuickSaleLineInput[],
    requestKey: string,
    actor: AuthenticatedIdentity,
  ): Promise<TableAccountSnapshot> {
    this.authorization.assertCan(actor.role, 'MODIFICAR_CUENTA_MESA');
    if (
      !operationId.trim() ||
      !requestKey.trim() ||
      !lines.length ||
      lines.some(
        (line) =>
          !line.productId.trim() || !Number.isSafeInteger(line.quantity) || line.quantity < 1,
      )
    )
      throw new InvalidTableAccountMutationError();
    return this.repository.add(
      this.command(operationId, requestKey, actor, {
        lines,
        generatedDetailIds: lines.map((line) => ({
          principalId: this.generateId(),
          addonIds: (line.addons ?? []).map(() => this.generateId()),
        })),
      }),
    );
  }
  addAddon(
    operationId: string,
    detailId: string,
    addonProductId: string,
    requestKey: string,
    actor: AuthenticatedIdentity,
  ): Promise<TableAccountSnapshot> {
    this.authorization.assertCan(actor.role, 'MODIFICAR_CUENTA_MESA');
    if (!detailId.trim() || !addonProductId.trim()) throw new InvalidTableAccountMutationError();
    return this.repository.addAddon(
      this.command(operationId, requestKey, actor, {
        detailId,
        addonProductId,
        generatedDetailIds: [{ principalId: this.generateId(), addonIds: [] }],
      }),
    );
  }
  changeQuantity(
    operationId: string,
    detailId: string,
    targetQuantity: number,
    requestKey: string,
    actor: AuthenticatedIdentity,
  ): Promise<TableAccountSnapshot> {
    this.authorization.assertCan(actor.role, 'MODIFICAR_CUENTA_MESA');
    if (!detailId.trim() || !Number.isSafeInteger(targetQuantity) || targetQuantity < 0)
      throw new InvalidTableAccountMutationError();
    return this.repository.changeQuantity(
      this.command(operationId, requestKey, actor, { detailId, targetQuantity }),
    );
  }
  changePrice(
    operationId: string,
    detailId: string,
    adjustment: QuickSalePriceAdjustmentInput | null,
    requestKey: string,
    actor: AuthenticatedIdentity,
  ): Promise<TableAccountSnapshot> {
    this.authorization.assertCan(actor.role, 'MODIFICAR_PRECIO_OPERACION');
    if (adjustment?.type === 'DESCUENTO')
      this.authorization.assertCan(actor.role, 'APLICAR_DESCUENTO');
    if (
      !detailId.trim() ||
      (adjustment !== null &&
        adjustment.type !== 'DESCUENTO' &&
        adjustment.type !== 'PRECIO_PERSONALIZADO') ||
      (adjustment !== null &&
        (!Number.isSafeInteger(adjustment.appliedPriceCents) ||
          adjustment.appliedPriceCents < 0 ||
          adjustment.reason.trim().length === 0))
    )
      throw new InvalidTableAccountMutationError();
    return this.repository.changePrice(
      this.command(operationId, requestKey, actor, {
        detailId,
        priceAdjustment:
          adjustment === null ? null : { ...adjustment, reason: adjustment.reason.trim() },
      }),
    );
  }
  markServed(
    operationId: string,
    detailId: string,
    requestKey: string,
    actor: AuthenticatedIdentity,
  ): Promise<TableAccountSnapshot> {
    this.authorization.assertCan(actor.role, 'MARCAR_PRODUCTO_SERVIDO');
    if (!detailId.trim()) throw new InvalidTableAccountMutationError();
    return this.repository.markServed(this.command(operationId, requestKey, actor, { detailId }));
  }
  linkTable(
    operationId: string,
    tableId: string,
    requestKey: string,
    actor: AuthenticatedIdentity,
  ): Promise<TableAccountSnapshot> {
    this.authorization.assertCan(actor.role, 'MODIFICAR_CUENTA_MESA');
    if (!tableId.trim()) throw new InvalidTableAccountMutationError();
    return this.repository.linkTable(this.command(operationId, requestKey, actor, { tableId }));
  }
  unlinkTable(
    operationId: string,
    tableId: string,
    requestKey: string,
    actor: AuthenticatedIdentity,
  ): Promise<TableAccountSnapshot> {
    this.authorization.assertCan(actor.role, 'MODIFICAR_CUENTA_MESA');
    if (!tableId.trim()) throw new InvalidTableAccountMutationError();
    return this.repository.unlinkTable(this.command(operationId, requestKey, actor, { tableId }));
  }
  private command(
    operationId: string,
    requestKey: string,
    actor: AuthenticatedIdentity,
    extra: Partial<TableAccountMutationCommand>,
  ): TableAccountMutationCommand {
    if (!operationId.trim() || !requestKey.trim()) throw new InvalidTableAccountMutationError();
    return {
      operationId: operationId.trim(),
      requestKey: requestKey.trim(),
      actorUserId: actor.userId,
      occurredAtUtc: this.nowUtc(),
      ...extra,
    };
  }
}
