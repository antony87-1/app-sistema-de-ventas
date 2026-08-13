import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy, PermissionDeniedError } from '../auth/authorization-policy';
import {
  InvalidEconomicCorrectionError,
  ManageEconomicCorrectionsUseCase,
  type CreateEconomicCorrectionInput,
  type EconomicCorrectionsRepository,
} from './manage-economic-corrections.use-case';

describe('ManageEconomicCorrectionsUseCase', () => {
  const repository: EconomicCorrectionsRepository = {
    listCorrectable: vi.fn().mockResolvedValue([]),
    listCorrections: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  };
  const admin: AuthenticatedIdentity = {
    userId: 'admin',
    displayName: 'Admin',
    role: 'ADMINISTRADOR',
  };
  const cashier: AuthenticatedIdentity = { ...admin, userId: 'cashier', role: 'CAJERO' };
  const useCase = new ManageEconomicCorrectionsUseCase(
    repository,
    new AuthorizationPolicy(),
    () => 'generated',
    () => '2026-07-30T20:00:00Z',
  );
  const valid: CreateEconomicCorrectionInput = {
    originalId: 'expense-1',
    originalType: 'GASTO',
    reason: 'Monto registrado en exceso',
    cashImpact: 'SUMA',
    cashAmountCents: 2000,
    paymentMethodId: 'cash',
    saleImpact: 'SIN_EFECTO',
    saleAmountCents: 0,
    saleJourneyId: null,
    idempotencyKey: 'request-1',
    actor: admin,
  };

  it('builds an auditable administrator correction command', async () => {
    await useCase.create(valid);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originalId: 'expense-1',
        reason: 'Monto registrado en exceso',
        actorUserId: 'admin',
        cashAmountCents: 2000,
      }),
    );
  });
  it('rejects every correction operation for the cashier', () => {
    expect(() => useCase.listCorrectable(cashier)).toThrow(PermissionDeniedError);
    expect(() => useCase.create({ ...valid, actor: cashier })).toThrow(PermissionDeniedError);
  });
  it('requires method and positive amount when cash is affected', () => {
    expect(() => useCase.create({ ...valid, paymentMethodId: null })).toThrow(
      InvalidEconomicCorrectionError,
    );
    expect(() => useCase.create({ ...valid, cashAmountCents: 0 })).toThrow(
      InvalidEconomicCorrectionError,
    );
  });
  it('requires a target journey only when sales are affected', () => {
    expect(() =>
      useCase.create({
        ...valid,
        cashImpact: 'SIN_EFECTO',
        cashAmountCents: 0,
        paymentMethodId: null,
        saleImpact: 'RESTA',
        saleAmountCents: 500,
        saleJourneyId: null,
      }),
    ).toThrow(InvalidEconomicCorrectionError);
  });
});
