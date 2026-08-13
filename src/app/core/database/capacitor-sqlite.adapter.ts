import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import type {
  capSQLiteResult,
  capSQLiteVersionUpgrade,
  capVersionResult,
} from '@capacitor-community/sqlite';

import type {
  SqliteAuthDatabase,
  SqliteAuthRow,
  SqliteAuthValue,
} from '../auth/sqlite-initial-users.repository';
import { DatabaseConfiguration, DatabaseDriver, DatabaseDriverState } from './database.types';
import { DATABASE_MIGRATIONS } from './migrations';

export interface SqliteDatabaseFacade {
  open(): Promise<void>;
  close(): Promise<void>;
  isDBOpen(): Promise<capSQLiteResult>;
  getVersion(): Promise<capVersionResult>;
  query(
    statement: string,
    values?: SqliteAuthValue[],
  ): Promise<{ values?: readonly SqliteAuthRow[] }>;
  run(statement: string, values?: SqliteAuthValue[], transaction?: boolean): Promise<unknown>;
  beginTransaction(): Promise<unknown>;
  commitTransaction(): Promise<unknown>;
  rollbackTransaction(): Promise<unknown>;
}

export interface SqliteConnectionFacade {
  addUpgradeStatement(databaseName: string, upgrades: capSQLiteVersionUpgrade[]): Promise<void>;
  checkConnectionsConsistency(): Promise<capSQLiteResult>;
  isConnection(databaseName: string, readOnly: boolean): Promise<capSQLiteResult>;
  retrieveConnection(databaseName: string, readOnly: boolean): Promise<SqliteDatabaseFacade>;
  createConnection(
    databaseName: string,
    encrypted: boolean,
    mode: string,
    version: number,
    readOnly: boolean,
  ): Promise<SqliteDatabaseFacade>;
  closeConnection(databaseName: string, readOnly: boolean): Promise<void>;
  isSecretStored(): Promise<capSQLiteResult>;
  setEncryptionSecret(secret: string): Promise<void>;
  isDatabase(databaseName: string): Promise<capSQLiteResult>;
}

export type DatabaseSecretGenerator = () => string;

export class DatabaseNotOpenError extends Error {
  readonly code = 'DATABASE_NOT_OPEN';

  constructor() {
    super('El almacenamiento local todavía no está disponible.');
    this.name = 'DatabaseNotOpenError';
  }
}

export class CapacitorSqliteAdapter implements DatabaseDriver, SqliteAuthDatabase {
  private activeConnection?: SqliteDatabaseFacade;

  constructor(
    private readonly sqlite: SqliteConnectionFacade,
    private readonly generateSecret: DatabaseSecretGenerator,
    private readonly isWebPlatform: () => boolean = () => false,
  ) {}

  async open(configuration: DatabaseConfiguration): Promise<DatabaseDriverState> {
    await this.sqlite.addUpgradeStatement(configuration.name, [...DATABASE_MIGRATIONS]);
    const consistency = await this.sqlite.checkConnectionsConsistency();
    await this.ensureEncryptionSecret(configuration);

    const connection = await this.getOrCreateConnection(configuration);
    const initialOpenState = await connection.isDBOpen();

    if (initialOpenState.result !== true) {
      await connection.open();
    }

    const [openState, versionState] = await Promise.all([
      connection.isDBOpen(),
      connection.getVersion(),
    ]);

    if (openState.result !== true || versionState.version === undefined) {
      throw new Error('SQLite did not return a valid open connection state.');
    }

    this.activeConnection = connection;

    return {
      connectionsConsistent: consistency.result === true,
      open: true,
      version: versionState.version,
    };
  }

  async close(configuration: DatabaseConfiguration): Promise<void> {
    const managedConnection = await this.sqlite.isConnection(
      configuration.name,
      configuration.readOnly,
    );

    if (managedConnection.result !== true) {
      this.activeConnection = undefined;
      return;
    }

    const connection = await this.sqlite.retrieveConnection(
      configuration.name,
      configuration.readOnly,
    );
    const openState = await connection.isDBOpen();

    if (openState.result === true) {
      await connection.close();
    }

    await this.sqlite.closeConnection(configuration.name, configuration.readOnly);
    this.activeConnection = undefined;
  }

  async query(
    statement: string,
    values: readonly SqliteAuthValue[] = [],
  ): Promise<readonly SqliteAuthRow[]> {
    const result = await this.requireActiveConnection().query(statement, [...values]);
    return result.values ?? [];
  }

  async run(statement: string, values: readonly SqliteAuthValue[] = []): Promise<void> {
    await this.requireActiveConnection().run(statement, [...values], false);
  }

  async beginTransaction(): Promise<void> {
    await this.requireActiveConnection().beginTransaction();
  }

  async commitTransaction(): Promise<void> {
    await this.requireActiveConnection().commitTransaction();
  }

  async rollbackTransaction(): Promise<void> {
    await this.requireActiveConnection().rollbackTransaction();
  }

  private async ensureEncryptionSecret(configuration: DatabaseConfiguration): Promise<void> {
    if (!configuration.encrypted || this.isWebPlatform()) {
      return;
    }

    const secretState = await this.sqlite.isSecretStored();

    if (secretState.result === true) {
      return;
    }

    const databaseState = await this.sqlite.isDatabase(configuration.name);

    if (databaseState.result === true) {
      throw new Error('La base cifrada existe, pero su secreto local no está disponible.');
    }

    await this.sqlite.setEncryptionSecret(this.generateSecret());
  }

  private async getOrCreateConnection(
    configuration: DatabaseConfiguration,
  ): Promise<SqliteDatabaseFacade> {
    const managedConnection = await this.sqlite.isConnection(
      configuration.name,
      configuration.readOnly,
    );

    if (managedConnection.result === true) {
      return this.sqlite.retrieveConnection(configuration.name, configuration.readOnly);
    }

    return this.sqlite.createConnection(
      configuration.name,
      this.isWebPlatform() ? false : configuration.encrypted,
      this.isWebPlatform() ? 'no-encryption' : configuration.encryptionMode,
      configuration.version,
      configuration.readOnly,
    );
  }

  private requireActiveConnection(): SqliteDatabaseFacade {
    if (this.activeConnection === undefined) {
      throw new DatabaseNotOpenError();
    }

    return this.activeConnection;
  }
}

export function generateDatabaseSecret(): string {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('A cryptographically secure random generator is unavailable.');
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createCapacitorSqliteAdapter(): CapacitorSqliteAdapter {
  return new CapacitorSqliteAdapter(
    new SQLiteConnection(CapacitorSQLite),
    generateDatabaseSecret,
    () => Capacitor.getPlatform() === 'web',
  );
}
