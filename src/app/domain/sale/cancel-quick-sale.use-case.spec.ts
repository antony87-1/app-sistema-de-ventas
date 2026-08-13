import { AuthorizationPolicy } from '../auth/authorization-policy';
import {
  CancelQuickSaleUseCase,
  InvalidQuickSaleCancellationError,
  type QuickSaleCancellationRepository,
} from './cancel-quick-sale.use-case';

describe('CancelQuickSaleUseCase', () => {
  it('normalizes the reason and uses the request key as an idempotent audit identity', async () => {
    const repository: QuickSaleCancellationRepository = { cancel: vi.fn().mockResolvedValue({}) };
    await new CancelQuickSaleUseCase(
      repository,
      new AuthorizationPolicy(),
      () => '2026-07-30T12:00:00Z',
    ).execute({
      operationId: ' sale-1 ',
      reason: '  Cliente desistió  ',
      idempotencyKey: ' cancel-key ',
      actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
    });
    expect(repository.cancel).toHaveBeenCalledWith({
      operationId: 'sale-1',
      reason: 'Cliente desistió',
      actorUserId: 'cashier',
      auditId: 'cancel-key',
      cancelledAtUtc: '2026-07-30T12:00:00Z',
    });
  });

  it('rejects a cancellation without a reason', () => {
    const useCase = new CancelQuickSaleUseCase(
      { cancel: vi.fn() },
      new AuthorizationPolicy(),
      () => 'now',
    );
    expect(() =>
      useCase.execute({
        operationId: 'sale-1',
        reason: ' ',
        idempotencyKey: 'key',
        actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
      }),
    ).toThrow(InvalidQuickSaleCancellationError);
  });
});
