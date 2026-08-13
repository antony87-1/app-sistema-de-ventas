import { InjectionToken } from '@angular/core';

export const DATABASE_CONFIGURATION = {
  name: 'kankachos_valeriano',
  version: 7,
  encrypted: true,
  encryptionMode: 'secret',
  readOnly: false,
} as const satisfies DatabaseConfiguration;

export interface DatabaseConfiguration {
  readonly name: string;
  readonly version: number;
  readonly encrypted: boolean;
  readonly encryptionMode: 'no-encryption' | 'encryption' | 'secret';
  readonly readOnly: boolean;
}

export interface DatabaseDriverState {
  readonly connectionsConsistent: boolean;
  readonly open: boolean;
  readonly version: number;
}

export interface DatabaseDriver {
  open(configuration: DatabaseConfiguration): Promise<DatabaseDriverState>;
  close(configuration: DatabaseConfiguration): Promise<void>;
}

export const DATABASE_DRIVER = new InjectionToken<DatabaseDriver>('DATABASE_DRIVER');

export type DatabaseDiagnostic =
  | {
      readonly status: 'NOT_INITIALIZED';
      readonly databaseName: string;
      readonly expectedVersion: number;
      readonly encrypted: boolean;
    }
  | {
      readonly status: 'READY';
      readonly databaseName: string;
      readonly expectedVersion: number;
      readonly actualVersion: number;
      readonly encrypted: boolean;
      readonly connectionsConsistent: boolean;
    };
