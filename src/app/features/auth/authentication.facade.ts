import { Inject, Injectable, InjectionToken } from '@angular/core';

import { ADMINISTRATOR_RECOVERY_REPOSITORY } from '../../core/auth/sqlite-administrator-recovery.repository';
import { AUTHENTICATION_REPOSITORY } from '../../core/auth/sqlite-authentication.repository';
import { INITIAL_USERS_REPOSITORY } from '../../core/auth/sqlite-initial-users.repository';
import { SessionService } from '../../core/auth/session.service';
import { DatabaseConnectionService } from '../../core/database/database-connection.service';
import {
  AuthenticateUserUseCase,
  type AuthenticatedIdentity,
} from '../../domain/auth/authenticate-user.use-case';
import {
  Argon2idPasswordHasher,
  PasswordPolicy,
} from '../../domain/auth/password-credential.service';
import {
  ProvisionInitialUsersUseCase,
  type InitialUsersRepository,
  type ProvisionInitialUsersInput,
} from '../../domain/auth/provision-initial-users.use-case';
import {
  RecoverAdministratorAccessUseCase,
  type AdministratorRecoveryRepository,
} from '../../domain/auth/recover-administrator-access.use-case';
import { LocalRecoveryCodeService } from '../../domain/auth/recovery-code.service';
import type { AuthenticationRepository } from '../../domain/auth/authenticate-user.use-case';

export interface AuthenticationFacadePort {
  hasUsers(): Promise<boolean>;
  provisionInitialUsers(input: ProvisionInitialUsersInput): Promise<{
    administratorId: string;
    cashierId: string;
    recoveryCode: string;
  }>;
  login(username: string, password: string): Promise<AuthenticatedIdentity>;
  recoverAdministrator(
    recoveryCode: string,
    newPassword: string,
  ): Promise<{ newRecoveryCode: string }>;
  logout(): void;
  currentIdentity(): AuthenticatedIdentity | null;
}

export const AUTH_FACADE = new InjectionToken<AuthenticationFacadePort>('AUTH_FACADE');

@Injectable()
export class AuthenticationFacade implements AuthenticationFacadePort {
  private readonly hasher = new Argon2idPasswordHasher();
  private readonly passwordPolicy = new PasswordPolicy();
  private readonly recoveryCodes = new LocalRecoveryCodeService(this.hasher);

  constructor(
    private readonly databaseConnection: DatabaseConnectionService,
    private readonly session: SessionService,
    @Inject(INITIAL_USERS_REPOSITORY) private readonly initialUsers: InitialUsersRepository,
    @Inject(AUTHENTICATION_REPOSITORY) private readonly authentication: AuthenticationRepository,
    @Inject(ADMINISTRATOR_RECOVERY_REPOSITORY)
    private readonly administratorRecovery: AdministratorRecoveryRepository,
  ) {}

  async hasUsers(): Promise<boolean> {
    await this.databaseConnection.initialize();
    return this.initialUsers.hasAnyUsers();
  }

  async provisionInitialUsers(input: ProvisionInitialUsersInput) {
    await this.databaseConnection.initialize();
    return new ProvisionInitialUsersUseCase(
      this.initialUsers,
      this.hasher,
      this.passwordPolicy,
      this.recoveryCodes,
      generateIdentifier,
      nowUtc,
    ).execute(input);
  }

  async login(username: string, password: string): Promise<AuthenticatedIdentity> {
    await this.databaseConnection.initialize();
    const identity = await new AuthenticateUserUseCase(
      this.authentication,
      this.hasher,
      generateIdentifier,
      nowUtc,
    ).execute({ username, password });
    this.session.start(identity);
    return identity;
  }

  async recoverAdministrator(recoveryCode: string, newPassword: string) {
    await this.databaseConnection.initialize();
    return new RecoverAdministratorAccessUseCase(
      this.administratorRecovery,
      this.hasher,
      this.passwordPolicy,
      this.recoveryCodes,
      generateIdentifier,
      nowUtc,
    ).execute({ recoveryCode, newPassword });
  }

  logout(): void {
    this.session.clear();
  }

  currentIdentity(): AuthenticatedIdentity | null {
    return this.session.current();
  }
}

function generateIdentifier(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nowUtc(): string {
  return new Date().toISOString();
}
