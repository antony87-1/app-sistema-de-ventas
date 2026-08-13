import { AuthorizationPolicy } from '../auth/authorization-policy';
import {
  CreateQuickSaleUseCase,
  InvalidQuickSaleRequestError,
  type QuickSaleRepository,
} from './create-quick-sale.use-case';

describe('CreateQuickSaleUseCase', () => {
  it('normalizes a sale and assigns identities to principal and addon details', async () => {
    const repository: QuickSaleRepository = { create: vi.fn().mockResolvedValue({}) };
    const ids = ['operation', 'audit', 'principal', 'addon'];
    await new CreateQuickSaleUseCase(
      repository,
      new AuthorizationPolicy(),
      () => ids.shift()!,
      () => 'VR-20260729-0001',
      () => '2026-07-29T20:00:00Z',
    ).execute({
      lines: [
        { productId: ' main ', quantity: 2, addons: [{ productId: ' addon ', quantity: 1 }] },
      ],
      note: '  Para llevar  ',
      idempotencyKey: ' sale-key ',
      actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'operation',
        operationCode: 'VR-20260729-0001',
        note: 'Para llevar',
        idempotencyKey: 'sale-key',
        actorUserId: 'cashier',
        lines: [
          {
            detailId: 'principal',
            productId: 'main',
            quantity: 2,
            priceAdjustment: null,
            addons: [{ detailId: 'addon', productId: 'addon', quantity: 1 }],
          },
        ],
      }),
    );
  });

  it('rejects empty sales and invalid quantities', () => {
    const useCase = new CreateQuickSaleUseCase(
      { create: vi.fn() },
      new AuthorizationPolicy(),
      () => 'id',
      () => 'code',
      () => 'now',
    );
    expect(() =>
      useCase.execute({
        lines: [],
        idempotencyKey: 'key',
        actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
      }),
    ).toThrow(InvalidQuickSaleRequestError);
  });

  it('rejects a price adjustment without a reason', () => {
    const useCase = new CreateQuickSaleUseCase(
      { create: vi.fn() },
      new AuthorizationPolicy(),
      () => 'id',
      () => 'code',
      () => 'now',
    );
    expect(() =>
      useCase.execute({
        lines: [
          {
            productId: 'product',
            quantity: 1,
            priceAdjustment: { type: 'DESCUENTO', appliedPriceCents: 100, reason: ' ' },
          },
        ],
        idempotencyKey: 'key',
        actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
      }),
    ).toThrow(InvalidQuickSaleRequestError);
  });
});
