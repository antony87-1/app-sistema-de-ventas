import { Inject, Injectable } from '@angular/core';

import {
  DATABASE_CONFIGURATION,
  DATABASE_DRIVER,
  DatabaseDiagnostic,
  DatabaseDriver,
} from './database.types';

export class DatabaseConnectionError extends Error {
  readonly code = 'DATABASE_CONNECTION_FAILED';

  constructor(cause: unknown) {
    super('No se pudo iniciar el almacenamiento local.', { cause });
    this.name = 'DatabaseConnectionError';
  }
}

@Injectable({ providedIn: 'root' })
export class DatabaseConnectionService {
  private diagnostic: DatabaseDiagnostic = this.notInitializedDiagnostic();
  private initialization?: Promise<DatabaseDiagnostic>;

  constructor(@Inject(DATABASE_DRIVER) private readonly driver: DatabaseDriver) {}

  initialize(): Promise<DatabaseDiagnostic> {
    if (this.diagnostic.status === 'READY') {
      return Promise.resolve(this.diagnostic);
    }

    this.initialization ??= this.openDatabase();
    return this.initialization;
  }

  diagnose(): DatabaseDiagnostic {
    return this.diagnostic;
  }

  async close(): Promise<void> {
    if (this.diagnostic.status !== 'READY') {
      return;
    }

    await this.driver.close(DATABASE_CONFIGURATION);
    this.diagnostic = this.notInitializedDiagnostic();
    this.initialization = undefined;
  }

  private async openDatabase(): Promise<DatabaseDiagnostic> {
    try {
      const state = await this.driver.open(DATABASE_CONFIGURATION);

      if (!state.open) {
        throw new Error('The database driver did not open the connection.');
      }

      this.diagnostic = {
        status: 'READY',
        databaseName: DATABASE_CONFIGURATION.name,
        expectedVersion: DATABASE_CONFIGURATION.version,
        actualVersion: state.version,
        encrypted: DATABASE_CONFIGURATION.encrypted,
        connectionsConsistent: state.connectionsConsistent,
      };

      return this.diagnostic;
    } catch (error: unknown) {
      this.initialization = undefined;
      throw new DatabaseConnectionError(error);
    }
  }

  private notInitializedDiagnostic(): DatabaseDiagnostic {
    return {
      status: 'NOT_INITIALIZED',
      databaseName: DATABASE_CONFIGURATION.name,
      expectedVersion: DATABASE_CONFIGURATION.version,
      encrypted: DATABASE_CONFIGURATION.encrypted,
    };
  }
}
