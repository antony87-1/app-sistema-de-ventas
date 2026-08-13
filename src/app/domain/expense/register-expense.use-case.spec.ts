import { AuthorizationPolicy, type UserRole } from '../auth/authorization-policy';
import {
  InvalidExpenseAmountError,
  InvalidExpenseRequestError,
  RegisterExpenseUseCase,
  type ExpenseRegistrationRepository,
} from './register-expense.use-case';

const NOW = '2026-07-30T00:00:00.000Z';

describe('RegisterExpenseUseCase', () => {
  it.each<UserRole>(['ADMINISTRADOR', 'CAJERO'])(
    'allows %s to register an expense with immutable metadata',
    async (role) => {
      const repository: ExpenseRegistrationRepository = {
        register: vi.fn().mockResolvedValue(expenseResult()),
      };
      const ids = ['expense-1', 'movement-1', 'audit-1'];
      const useCase = new RegisterExpenseUseCase(
        repository,
        new AuthorizationPolicy(),
        () => ids.shift() ?? 'unexpected-id',
        () => NOW,
      );

      await useCase.execute({
        categoryId: ' category-1 ',
        paymentMethodId: ' cash-1 ',
        description: ' Compra de carbón ',
        amountCents: 5000,
        supplier: ' Mercado local ',
        note: ' Para el servicio ',
        idempotencyKey: ' request-1 ',
        actor: { userId: 'user-1', displayName: 'Caja', role },
      });

      expect(repository.register).toHaveBeenCalledWith({
        expenseId: 'expense-1',
        movementId: 'movement-1',
        auditId: 'audit-1',
        categoryId: 'category-1',
        paymentMethodId: 'cash-1',
        description: 'Compra de carbón',
        amountCents: 5000,
        supplier: 'Mercado local',
        note: 'Para el servicio',
        idempotencyKey: 'request-1',
        actorUserId: 'user-1',
        occurredAtUtc: NOW,
      });
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid amount %s before persistence',
    async (amountCents) => {
      const repository: ExpenseRegistrationRepository = { register: vi.fn() };

      await expect(
        createUseCase(repository).execute(validInput({ amountCents })),
      ).rejects.toBeInstanceOf(InvalidExpenseAmountError);
      expect(repository.register).not.toHaveBeenCalled();
    },
  );

  it.each([
    { categoryId: ' ' },
    { paymentMethodId: ' ' },
    { description: ' ' },
    { idempotencyKey: ' ' },
  ])('rejects incomplete required data before persistence', async (change) => {
    const repository: ExpenseRegistrationRepository = { register: vi.fn() };

    await expect(createUseCase(repository).execute(validInput(change))).rejects.toBeInstanceOf(
      InvalidExpenseRequestError,
    );
    expect(repository.register).not.toHaveBeenCalled();
  });

  it('normalizes blank optional fields to null', async () => {
    const repository: ExpenseRegistrationRepository = {
      register: vi.fn().mockResolvedValue(expenseResult()),
    };

    await createUseCase(repository).execute(validInput({ supplier: ' ', note: undefined }));

    expect(repository.register).toHaveBeenCalledWith(
      expect.objectContaining({ supplier: null, note: null }),
    );
  });
});

function createUseCase(repository: ExpenseRegistrationRepository): RegisterExpenseUseCase {
  const ids = ['expense-1', 'movement-1', 'audit-1'];
  return new RegisterExpenseUseCase(
    repository,
    new AuthorizationPolicy(),
    () => ids.shift() ?? 'unexpected-id',
    () => NOW,
  );
}

function validInput(change: Record<string, unknown> = {}) {
  return {
    categoryId: 'category-1',
    paymentMethodId: 'cash-1',
    description: 'Compra de carbón',
    amountCents: 5000,
    supplier: null,
    note: null,
    idempotencyKey: 'request-1',
    actor: { userId: 'user-1', displayName: 'Caja', role: 'CAJERO' as const },
    ...change,
  };
}

function expenseResult() {
  return {
    id: 'expense-1',
    journeyId: 'journey-1',
    categoryId: 'category-1',
    categoryName: 'Compra de insumos',
    paymentMethodId: 'cash-1',
    paymentMethodName: 'Efectivo',
    description: 'Compra de carbón',
    amountCents: 5000,
    supplier: null,
    note: null,
    registeredByUserId: 'user-1',
    registeredAtUtc: NOW,
  };
}
