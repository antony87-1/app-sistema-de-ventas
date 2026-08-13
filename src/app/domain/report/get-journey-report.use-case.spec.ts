import { AuthorizationPolicy, PermissionDeniedError } from '../auth/authorization-policy';
import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import {
  GetJourneyReportUseCase,
  InvalidJourneyReportRequestError,
  type JourneyReportRepository,
} from './get-journey-report.use-case';

describe('GetJourneyReportUseCase', () => {
  const repository: JourneyReportRepository = {
    listJourneys: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
  };
  const useCase = new GetJourneyReportUseCase(repository, new AuthorizationPolicy());
  const admin: AuthenticatedIdentity = {
    userId: 'admin',
    displayName: 'Administrador',
    role: 'ADMINISTRADOR',
  };
  const cashier: AuthenticatedIdentity = { ...admin, userId: 'cashier', role: 'CAJERO' };

  it('allows the administrator to list and load historical journeys', async () => {
    await expect(useCase.list(admin)).resolves.toEqual([]);
    await expect(useCase.get('journey-1', admin)).resolves.toBeNull();
  });

  it('rejects report access for a cashier', () => {
    expect(() => useCase.list(cashier)).toThrow(PermissionDeniedError);
    expect(() => useCase.get('journey-1', cashier)).toThrow(PermissionDeniedError);
  });

  it('rejects an empty journey identifier', () => {
    expect(() => useCase.get('  ', admin)).toThrow(InvalidJourneyReportRequestError);
  });
});
