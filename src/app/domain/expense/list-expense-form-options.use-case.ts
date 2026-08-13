export interface ExpenseCategoryOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface ExpensePaymentMethodOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface ExpenseFormOptions {
  readonly categories: readonly ExpenseCategoryOption[];
  readonly paymentMethods: readonly ExpensePaymentMethodOption[];
}

export interface ExpenseFormOptionsRepository {
  listActive(): Promise<ExpenseFormOptions>;
}

export class ListExpenseFormOptionsUseCase {
  constructor(private readonly repository: ExpenseFormOptionsRepository) {}

  execute(): Promise<ExpenseFormOptions> {
    return this.repository.listActive();
  }
}
