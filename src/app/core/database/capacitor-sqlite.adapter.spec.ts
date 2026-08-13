import {
  CapacitorSqliteAdapter,
  DatabaseNotOpenError,
  SqliteConnectionFacade,
  SqliteDatabaseFacade,
  generateDatabaseSecret,
} from './capacitor-sqlite.adapter';
import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';
import { DATABASE_CONFIGURATION } from './database.types';

class FakeSqliteDatabase implements SqliteDatabaseFacade {
  openCalls = 0;
  closeCalls = 0;
  openState = false;
  version = DATABASE_CONFIGURATION.version;
  queryResult: readonly Readonly<Record<string, string | number | null>>[] = [];
  queryCalls: Array<readonly [string, readonly (string | number | null)[]]> = [];
  runCalls: Array<readonly [string, readonly (string | number | null)[], boolean]> = [];
  beginCalls = 0;
  commitCalls = 0;
  rollbackCalls = 0;

  async open(): Promise<void> {
    this.openCalls += 1;
    this.openState = true;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.openState = false;
  }

  async isDBOpen(): Promise<{ result?: boolean }> {
    return { result: this.openState };
  }

  async getVersion(): Promise<{ version?: number }> {
    return { version: this.version };
  }

  async query(
    statement: string,
    values: (string | number | null)[] = [],
  ): Promise<{ values?: readonly Readonly<Record<string, string | number | null>>[] }> {
    this.queryCalls.push([statement, values]);
    return { values: this.queryResult };
  }

  async run(
    statement: string,
    values: (string | number | null)[] = [],
    transaction = true,
  ): Promise<void> {
    this.runCalls.push([statement, values, transaction]);
  }

  async beginTransaction(): Promise<void> {
    this.beginCalls += 1;
  }

  async commitTransaction(): Promise<void> {
    this.commitCalls += 1;
  }

  async rollbackTransaction(): Promise<void> {
    this.rollbackCalls += 1;
  }
}

class FakeSqliteConnection implements SqliteConnectionFacade {
  readonly database = new FakeSqliteDatabase();
  connectionsConsistent = true;
  connectionExists = false;
  databaseExists = false;
  secretStored = true;
  createdWith?: readonly [string, boolean, string, number, boolean];
  retrievedWith?: readonly [string, boolean];
  closedWith?: readonly [string, boolean];
  storedSecrets: string[] = [];
  registeredUpgrades?: readonly [string, capSQLiteVersionUpgrade[]];
  readonly events: string[] = [];

  async addUpgradeStatement(
    databaseName: string,
    upgrades: capSQLiteVersionUpgrade[],
  ): Promise<void> {
    this.registeredUpgrades = [databaseName, upgrades];
    this.events.push('migrations');
  }

  async checkConnectionsConsistency(): Promise<{ result?: boolean }> {
    return { result: this.connectionsConsistent };
  }

  async isConnection(): Promise<{ result?: boolean }> {
    return { result: this.connectionExists };
  }

  async retrieveConnection(databaseName: string, readOnly: boolean): Promise<SqliteDatabaseFacade> {
    this.retrievedWith = [databaseName, readOnly];
    return this.database;
  }

  async createConnection(
    databaseName: string,
    encrypted: boolean,
    mode: string,
    version: number,
    readOnly: boolean,
  ): Promise<SqliteDatabaseFacade> {
    this.events.push('create-connection');
    this.createdWith = [databaseName, encrypted, mode, version, readOnly];
    this.connectionExists = true;
    return this.database;
  }

  async closeConnection(databaseName: string, readOnly: boolean): Promise<void> {
    this.closedWith = [databaseName, readOnly];
    this.connectionExists = false;
  }

  async isSecretStored(): Promise<{ result?: boolean }> {
    return { result: this.secretStored };
  }

  async setEncryptionSecret(secret: string): Promise<void> {
    this.storedSecrets.push(secret);
    this.secretStored = true;
  }

  async isDatabase(): Promise<{ result?: boolean }> {
    return { result: this.databaseExists };
  }
}

describe('CapacitorSqliteAdapter', () => {
  let sqlite: FakeSqliteConnection;
  let adapter: CapacitorSqliteAdapter;

  beforeEach(() => {
    sqlite = new FakeSqliteConnection();
    adapter = new CapacitorSqliteAdapter(sqlite, () => 'generated-secret');
  });

  it('creates and opens the configured connection', async () => {
    const state = await adapter.open(DATABASE_CONFIGURATION);

    expect(sqlite.createdWith).toEqual(['kankachos_valeriano', true, 'secret', 7, false]);
    expect(sqlite.database.openCalls).toBe(1);
    expect(state).toEqual({
      connectionsConsistent: true,
      open: true,
      version: 7,
    });
  });

  it('uses an unencrypted IndexedDB-backed connection on the web platform', async () => {
    sqlite.secretStored = false;
    adapter = new CapacitorSqliteAdapter(
      sqlite,
      () => 'generated-secret',
      () => true,
    );

    await adapter.open(DATABASE_CONFIGURATION);

    expect(sqlite.createdWith).toEqual(['kankachos_valeriano', false, 'no-encryption', 7, false]);
    expect(sqlite.storedSecrets).toHaveLength(0);
  });

  it('registers schema migrations before creating the connection', async () => {
    await adapter.open(DATABASE_CONFIGURATION);

    expect(sqlite.registeredUpgrades?.[0]).toBe('kankachos_valeriano');
    expect(sqlite.registeredUpgrades?.[1]).toEqual([
      expect.objectContaining({ toVersion: 1 }),
      expect.objectContaining({ toVersion: 2 }),
      expect.objectContaining({ toVersion: 3 }),
      expect.objectContaining({ toVersion: 4 }),
      expect.objectContaining({ toVersion: 5 }),
      expect.objectContaining({ toVersion: 6 }),
      expect.objectContaining({ toVersion: 7 }),
    ]);
    expect(sqlite.events).toEqual(['migrations', 'create-connection']);
  });

  it('exposes the opened connection to repositories with explicit transactions', async () => {
    sqlite.database.queryResult = [{ found: 1 }];
    await adapter.open(DATABASE_CONFIGURATION);

    await expect(adapter.query('SELECT ?', ['value'])).resolves.toEqual([{ found: 1 }]);
    await adapter.beginTransaction();
    await adapter.run('INSERT INTO example(value) VALUES (?)', ['value']);
    await adapter.commitTransaction();
    await adapter.rollbackTransaction();

    expect(sqlite.database.queryCalls).toEqual([['SELECT ?', ['value']]]);
    expect(sqlite.database.runCalls).toEqual([
      ['INSERT INTO example(value) VALUES (?)', ['value'], false],
    ]);
    expect(sqlite.database.beginCalls).toBe(1);
    expect(sqlite.database.commitCalls).toBe(1);
    expect(sqlite.database.rollbackCalls).toBe(1);
  });

  it('rejects repository access while the database is closed', async () => {
    await expect(adapter.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseNotOpenError);
    await expect(adapter.run('SELECT 1')).rejects.toBeInstanceOf(DatabaseNotOpenError);
    await expect(adapter.beginTransaction()).rejects.toBeInstanceOf(DatabaseNotOpenError);
  });

  it('retrieves an existing connection without reopening it', async () => {
    sqlite.connectionExists = true;
    sqlite.database.openState = true;

    await adapter.open(DATABASE_CONFIGURATION);

    expect(sqlite.retrievedWith).toEqual(['kankachos_valeriano', false]);
    expect(sqlite.createdWith).toBeUndefined();
    expect(sqlite.database.openCalls).toBe(0);
  });

  it('creates a secret for the first encrypted database', async () => {
    sqlite.secretStored = false;
    sqlite.databaseExists = false;

    await adapter.open(DATABASE_CONFIGURATION);

    expect(sqlite.storedSecrets).toEqual(['generated-secret']);
  });

  it('does not replace the secret of an existing encrypted database', async () => {
    sqlite.secretStored = false;
    sqlite.databaseExists = true;

    await expect(adapter.open(DATABASE_CONFIGURATION)).rejects.toThrow(
      'La base cifrada existe, pero su secreto local no está disponible.',
    );
    expect(sqlite.storedSecrets).toHaveLength(0);
    expect(sqlite.createdWith).toBeUndefined();
  });

  it('reports when connection consistency had to be recovered', async () => {
    sqlite.connectionsConsistent = false;

    await expect(adapter.open(DATABASE_CONFIGURATION)).resolves.toMatchObject({
      connectionsConsistent: false,
    });
  });

  it('closes the database and removes the managed connection', async () => {
    sqlite.connectionExists = true;
    sqlite.database.openState = true;

    await adapter.close(DATABASE_CONFIGURATION);

    expect(sqlite.database.closeCalls).toBe(1);
    expect(sqlite.closedWith).toEqual(['kankachos_valeriano', false]);
  });

  it('does nothing when there is no managed connection to close', async () => {
    await adapter.close(DATABASE_CONFIGURATION);

    expect(sqlite.database.closeCalls).toBe(0);
    expect(sqlite.closedWith).toBeUndefined();
  });
});

describe('generateDatabaseSecret', () => {
  it('creates a 256-bit hexadecimal secret with cryptographic randomness', () => {
    const first = generateDatabaseSecret();
    const second = generateDatabaseSecret();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });
});
