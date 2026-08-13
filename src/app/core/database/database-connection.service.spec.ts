import { DatabaseConnectionService } from './database-connection.service';
import {
  DATABASE_CONFIGURATION,
  DatabaseConfiguration,
  DatabaseDriver,
  DatabaseDriverState,
} from './database.types';

class FakeDatabaseDriver implements DatabaseDriver {
  openCalls: DatabaseConfiguration[] = [];
  closeCalls: DatabaseConfiguration[] = [];
  state: DatabaseDriverState = {
    connectionsConsistent: true,
    open: true,
    version: DATABASE_CONFIGURATION.version,
  };
  openError: unknown;

  async open(configuration: DatabaseConfiguration): Promise<DatabaseDriverState> {
    this.openCalls.push(configuration);

    if (this.openError !== undefined) {
      throw this.openError;
    }

    return this.state;
  }

  async close(configuration: DatabaseConfiguration): Promise<void> {
    this.closeCalls.push(configuration);
  }
}

describe('DatabaseConnectionService', () => {
  let driver: FakeDatabaseDriver;
  let service: DatabaseConnectionService;

  beforeEach(() => {
    driver = new FakeDatabaseDriver();
    service = new DatabaseConnectionService(driver);
  });

  it('reports that the database has not been initialized', () => {
    expect(service.diagnose()).toEqual({
      status: 'NOT_INITIALIZED',
      databaseName: 'kankachos_valeriano',
      expectedVersion: 7,
      encrypted: true,
    });
  });

  it('opens the configured encrypted database and reports it ready', async () => {
    const diagnostic = await service.initialize();

    expect(driver.openCalls).toEqual([DATABASE_CONFIGURATION]);
    expect(diagnostic).toEqual({
      status: 'READY',
      databaseName: 'kankachos_valeriano',
      expectedVersion: 7,
      actualVersion: 7,
      encrypted: true,
      connectionsConsistent: true,
    });
    expect(service.diagnose()).toEqual(diagnostic);
  });

  it('shares one initialization when called concurrently', async () => {
    const first = service.initialize();
    const second = service.initialize();

    const [firstDiagnostic, secondDiagnostic] = await Promise.all([first, second]);

    expect(driver.openCalls).toHaveLength(1);
    expect(firstDiagnostic).toBe(secondDiagnostic);
  });

  it('returns the existing diagnostic after initialization', async () => {
    const first = await service.initialize();
    const second = await service.initialize();

    expect(driver.openCalls).toHaveLength(1);
    expect(second).toBe(first);
  });

  it('allows retrying after a failed initialization without exposing the native error', async () => {
    driver.openError = new Error('native path and secret details');

    await expect(service.initialize()).rejects.toMatchObject({
      name: 'DatabaseConnectionError',
      code: 'DATABASE_CONNECTION_FAILED',
      message: 'No se pudo iniciar el almacenamiento local.',
    });
    expect(service.diagnose().status).toBe('NOT_INITIALIZED');

    driver.openError = undefined;
    await expect(service.initialize()).resolves.toMatchObject({ status: 'READY' });
    expect(driver.openCalls).toHaveLength(2);
  });

  it('closes an initialized database and resets the diagnostic', async () => {
    await service.initialize();

    await service.close();

    expect(driver.closeCalls).toEqual([DATABASE_CONFIGURATION]);
    expect(service.diagnose().status).toBe('NOT_INITIALIZED');
  });

  it('does not ask the driver to close before initialization', async () => {
    await service.close();

    expect(driver.closeCalls).toHaveLength(0);
  });
});
