import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface QuickSaleAddonInput {
  readonly productId: string;
  readonly quantity: number;
}

export interface QuickSaleLineInput {
  readonly productId: string;
  readonly quantity: number;
  readonly addons?: readonly QuickSaleAddonInput[];
  readonly priceAdjustment?: QuickSalePriceAdjustmentInput | null;
}

export interface QuickSalePriceAdjustmentInput {
  readonly type: 'DESCUENTO' | 'PRECIO_PERSONALIZADO';
  readonly appliedPriceCents: number;
  readonly reason: string;
}

export interface CreateQuickSaleInput {
  readonly lines: readonly QuickSaleLineInput[];
  readonly note?: string | null;
  readonly idempotencyKey: string;
  readonly actor: AuthenticatedIdentity;
}

export interface QuickSaleDetailCommand {
  readonly detailId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly addons: readonly QuickSaleAddonDetailCommand[];
  readonly priceAdjustment: QuickSalePriceAdjustmentInput | null;
}

export interface QuickSaleAddonDetailCommand extends QuickSaleAddonInput {
  readonly detailId: string;
}

export interface CreateQuickSaleCommand {
  readonly operationId: string;
  readonly operationCode: string;
  readonly auditId: string;
  readonly lines: readonly QuickSaleDetailCommand[];
  readonly note: string | null;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly createdAtUtc: string;
}

export interface CreatedQuickSale {
  readonly operationId: string;
  readonly operationCode: string;
  readonly journeyId: string;
  readonly state: 'ABIERTA';
  readonly totalCents: number;
  readonly balanceCents: number;
  readonly detailCount: number;
  readonly createdByUserId: string;
  readonly createdAtUtc: string;
}

export interface QuickSaleRepository {
  create(command: CreateQuickSaleCommand): Promise<CreatedQuickSale>;
}

export class InvalidQuickSaleRequestError extends Error {
  readonly code = 'INVALID_QUICK_SALE_REQUEST';
}

export class OpenJourneyForQuickSaleRequiredError extends Error {
  readonly code = 'OPEN_JOURNEY_FOR_QUICK_SALE_REQUIRED';
}

export class QuickSaleProductUnavailableError extends Error {
  readonly code = 'QUICK_SALE_PRODUCT_UNAVAILABLE';
}

export class QuickSaleAddonNotAllowedError extends Error {
  readonly code = 'QUICK_SALE_ADDON_NOT_ALLOWED';
}

export class QuickSaleIdempotencyConflictError extends Error {
  readonly code = 'QUICK_SALE_IDEMPOTENCY_CONFLICT';
}

export class CreateQuickSaleUseCase {
  constructor(
    private readonly repository: QuickSaleRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly generateOperationCode: () => string,
    private readonly nowUtc: () => string,
  ) {}

  execute(input: CreateQuickSaleInput): Promise<CreatedQuickSale> {
    this.authorization.assertCan(input.actor.role, 'REGISTRAR_VENTA_RAPIDA');
    const idempotencyKey = input.idempotencyKey.trim();
    if (
      idempotencyKey.length === 0 ||
      input.lines.length === 0 ||
      input.lines.some(
        (line) =>
          !validSelection(line.productId, line.quantity) ||
          !validAdjustment(line.priceAdjustment) ||
          (line.addons ?? []).some((addon) => !validSelection(addon.productId, addon.quantity)),
      )
    ) {
      throw new InvalidQuickSaleRequestError();
    }
    return this.repository.create({
      operationId: this.generateId(),
      operationCode: this.generateOperationCode(),
      auditId: this.generateId(),
      lines: input.lines.map((line) => ({
        detailId: this.generateId(),
        productId: line.productId.trim(),
        quantity: line.quantity,
        priceAdjustment: normalizeAdjustment(line.priceAdjustment),
        addons: (line.addons ?? []).map((addon) => ({
          detailId: this.generateId(),
          productId: addon.productId.trim(),
          quantity: addon.quantity,
        })),
      })),
      note: optional(input.note),
      idempotencyKey,
      actorUserId: input.actor.userId,
      createdAtUtc: this.nowUtc(),
    });
  }
}

function validAdjustment(adjustment: QuickSalePriceAdjustmentInput | null | undefined): boolean {
  return (
    adjustment == null ||
    (Number.isSafeInteger(adjustment.appliedPriceCents) &&
      adjustment.appliedPriceCents >= 0 &&
      adjustment.reason.trim().length > 0)
  );
}

function normalizeAdjustment(
  adjustment: QuickSalePriceAdjustmentInput | null | undefined,
): QuickSalePriceAdjustmentInput | null {
  return adjustment == null ? null : { ...adjustment, reason: adjustment.reason.trim() };
}

function validSelection(productId: string, quantity: number): boolean {
  return productId.trim().length > 0 && Number.isSafeInteger(quantity) && quantity > 0;
}

function optional(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}
