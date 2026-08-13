import { AuthorizationPolicy } from '../auth/authorization-policy';
import {
  ListQuickSaleHistoryUseCase,
  type QuickSaleHistoryRepository,
} from './list-quick-sale-history.use-case';

describe('ListQuickSaleHistoryUseCase', () => {
  it('allows a cashier to consult immutable operations of the current journey', async () => {
    const repository: QuickSaleHistoryRepository = { list: vi.fn().mockResolvedValue([]) };
    await new ListQuickSaleHistoryUseCase(repository, new AuthorizationPolicy()).execute({
      userId: 'cashier',
      displayName: 'Caja',
      role: 'CAJERO',
    });
    expect(repository.list).toHaveBeenCalledOnce();
  });
});
