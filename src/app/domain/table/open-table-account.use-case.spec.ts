import { AuthorizationPolicy } from '../auth/authorization-policy';
import {
  OpenTableAccountUseCase,
  type TableAccountRepository,
} from './open-table-account.use-case';

describe('OpenTableAccountUseCase', () => {
  it('authorizes and normalizes opening a table account', async () => {
    const repository: TableAccountRepository = { open: vi.fn().mockResolvedValue({}) };
    const useCase = new OpenTableAccountUseCase(
      repository,
      new AuthorizationPolicy(),
      () => 'id',
      () => 'CM-1',
      () => 'now',
    );
    await useCase.execute({
      tableId: ' table-1 ',
      note: '  cerca puerta ',
      idempotencyKey: ' key ',
      actor: { userId: 'cashier', displayName: 'Caja', role: 'CAJERO' },
    });
    expect(repository.open).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'table-1',
        note: 'cerca puerta',
        idempotencyKey: 'key',
        actorUserId: 'cashier',
      }),
    );
  });
});
