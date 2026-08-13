import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export type ServiceTableState = 'DISPONIBLE' | 'OCUPADA' | 'PENDIENTE_SERVIR' | 'PAGADA';

export interface ServiceTableAccount {
  readonly operationId: string;
  readonly operationCode: string;
  readonly label: 'Cuenta A' | 'Cuenta B';
  readonly state: Exclude<ServiceTableState, 'DISPONIBLE'>;
  readonly balanceCents: number;
  readonly createdAtUtc: string;
}

export interface ServiceTable {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly joinedName: string | null;
  readonly state: ServiceTableState;
  readonly balanceCents: number;
  readonly accounts: readonly ServiceTableAccount[];
}

export interface ServiceTablesRepository {
  list(): Promise<readonly ServiceTable[]>;
}

export class ListServiceTablesUseCase {
  constructor(
    private readonly repository: ServiceTablesRepository,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  execute(actor: AuthenticatedIdentity): Promise<readonly ServiceTable[]> {
    this.authorization.assertCan(actor.role, 'CONSULTAR_OPERACIONES_DIA');
    return this.repository.list();
  }
}
