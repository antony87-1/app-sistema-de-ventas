import { AuthorizationPolicy } from '../auth/authorization-policy';
import {
  ListPendingQuickSalesUseCase,
  type PendingQuickSalesRepository,
} from './list-pending-quick-sales.use-case';

describe('ListPendingQuickSalesUseCase', () => {
  it('allows a cashier to consult the open operations of the day', async () => {
    const repository: PendingQuickSalesRepository = {
      list: vi.fn().mockResolvedValue([]),
    };

    await new ListPendingQuickSalesUseCase(repository, new AuthorizationPolicy()).execute({
      userId: 'cashier',
      displayName: 'Caja',
      role: 'CAJERO',
    });

    expect(repository.list).toHaveBeenCalledOnce();
  });
});
