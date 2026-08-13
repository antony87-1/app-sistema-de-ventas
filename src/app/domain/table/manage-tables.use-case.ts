import type { AuthenticatedIdentity } from '../auth/authenticate-user.use-case';
import { AuthorizationPolicy } from '../auth/authorization-policy';

export interface ManagedTable {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly order: number;
  readonly active: boolean;
  readonly openAccounts: number;
}

export interface SaveTableInput {
  readonly id?: string;
  readonly name: string;
  readonly order: number;
  readonly active: boolean;
  readonly actor: AuthenticatedIdentity;
}

export interface SaveTableCommand extends Omit<SaveTableInput, 'actor'> {
  readonly id: string;
  readonly code: string;
  readonly actorUserId: string;
  readonly occurredAtUtc: string;
  readonly auditId: string;
}

export interface TableAdministrationRepository {
  list(): Promise<readonly ManagedTable[]>;
  save(command: SaveTableCommand): Promise<ManagedTable>;
}

export class InvalidTableAdministrationError extends Error {
  readonly code = 'INVALID_TABLE_ADMINISTRATION';
  constructor(message = 'Los datos de la mesa no son válidos.') {
    super(message);
  }
}

export class TableWithOpenAccountsError extends Error {
  readonly code = 'TABLE_WITH_OPEN_ACCOUNTS';
  constructor() {
    super('No se puede desactivar una mesa con cuentas abiertas.');
  }
}

export class ManageTablesUseCase {
  constructor(
    private readonly repository: TableAdministrationRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly generateId: () => string,
    private readonly nowUtc: () => string,
  ) {}

  list(actor: AuthenticatedIdentity) {
    this.authorization.assertCan(actor.role, 'ADMINISTRAR_MESAS');
    return this.repository.list();
  }

  save(input: SaveTableInput) {
    this.authorization.assertCan(input.actor.role, 'ADMINISTRAR_MESAS');
    const name = input.name.trim();
    if (!name || name.length > 60 || !Number.isSafeInteger(input.order) || input.order < 0) {
      throw new InvalidTableAdministrationError();
    }
    const id = input.id?.trim() || this.generateId();
    return this.repository.save({
      id,
      code: input.id ? '' : `MESA-${id.slice(0, 8).toUpperCase()}`,
      name,
      order: input.order,
      active: input.active,
      actorUserId: input.actor.userId,
      occurredAtUtc: this.nowUtc(),
      auditId: this.generateId(),
    });
  }
}
