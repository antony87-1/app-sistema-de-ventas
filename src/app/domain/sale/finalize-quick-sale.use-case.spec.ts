import { AuthorizationPolicy } from '../auth/authorization-policy';
import {
  FinalizeQuickSaleUseCase,
  InvalidQuickSalePaymentError,
  type QuickSaleFinalizationRepository,
} from './finalize-quick-sale.use-case';

describe('FinalizeQuickSaleUseCase', () => {
  it('authorizes the cashier and assigns every immutable payment identity', async () => {
    const repository: QuickSaleFinalizationRepository = {
      finalize: vi.fn().mockResolvedValue({}),
    };
    const ids = ['payment', 'audit', 'cash-entry', 'cash-movement', 'yape-entry', 'yape-movement'];

    await new FinalizeQuickSaleUseCase(
      repository,
      new AuthorizationPolicy(),
      () => ids.shift()!,
      () => '2026-07-29T20:05:00Z',
    ).execute({
      operationId: ' sale-1 ',
      payments: [
        { methodCode: 'EFECTIVO', appliedCents: 1500, receivedCents: 2000 },
        { methodCode: 'YAPE', appliedCents: 1000, receivedCents: 1000 },
      ],
      idempotencyKey: ' payment-key ',
      actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
    });

    expect(repository.finalize).toHaveBeenCalledWith({
      paymentId: 'payment',
      auditId: 'audit',
      operationId: 'sale-1',
      payments: [
        {
          methodCode: 'EFECTIVO',
          appliedCents: 1500,
          receivedCents: 2000,
          paymentMethodEntryId: 'cash-entry',
          movementId: 'cash-movement',
        },
        {
          methodCode: 'YAPE',
          appliedCents: 1000,
          receivedCents: 1000,
          paymentMethodEntryId: 'yape-entry',
          movementId: 'yape-movement',
        },
      ],
      actorUserId: 'cashier',
      idempotencyKey: 'payment-key',
      confirmedAtUtc: '2026-07-29T20:05:00Z',
    });
  });

  it('rejects an empty operation or a non-positive received amount', () => {
    const useCase = new FinalizeQuickSaleUseCase(
      { finalize: vi.fn() },
      new AuthorizationPolicy(),
      () => 'id',
      () => 'now',
    );

    expect(() =>
      useCase.execute({
        operationId: '',
        payments: [{ methodCode: 'YAPE', appliedCents: 100, receivedCents: 0 }],
        idempotencyKey: 'key',
        actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
      }),
    ).toThrow(InvalidQuickSalePaymentError);
  });
});
