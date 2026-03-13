const connectMock = jest.fn();
const queryMock = jest.fn();
const endMock = jest.fn();
const clientConstructorMock = jest.fn();

jest.mock('pg', () => ({
  escapeIdentifier: jest.requireActual('pg').escapeIdentifier,
  Client: function (...args: unknown[]) {
    return clientConstructorMock(...args);
  },
}));

type ScriptModule = {
  DEFAULT_DB_READER_USERNAME: string;
  buildConnectionString: (env?: Record<string, string | undefined>) => string | undefined;
  bootstrapTmSchemaPermissions: (
    config?: {
      connectionString?: string;
      dbReaderUsername: string;
    },
    dependencies?: {
      ClientCtor?: new (config: { connectionString: string }) => {
        connect: () => Promise<void>;
        query: (sql: string) => Promise<unknown>;
        end: () => Promise<void>;
      };
      logger?: {
        info: jest.Mock;
        warn: jest.Mock;
      };
    }
  ) => Promise<void>;
  normaliseOptions: (options?: string) => string;
  validateIdentifier: (identifier: string) => void;
  resolveBootstrapConfig: (env?: Record<string, string | undefined>) => {
    connectionString?: string;
    dbReaderUsername: string;
  };
  runFromEnvironment: (
    env?: Record<string, string | undefined>,
    dependencies?: {
      logger?: {
        info: jest.Mock;
        warn: jest.Mock;
      };
    }
  ) => Promise<void>;
};

const loadModule = (): ScriptModule => {
  let moduleExports: ScriptModule | undefined;

  jest.isolateModules(() => {
    moduleExports = require('../../../../scripts/bootstrap-tm-schema-permissions.js');
  });

  return moduleExports!;
};

describe('bootstrap-tm-schema-permissions script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    connectMock.mockResolvedValue(undefined);
    queryMock.mockResolvedValue(undefined);
    endMock.mockResolvedValue(undefined);
    clientConstructorMock.mockReturnValue({
      connect: connectMock,
      query: queryMock,
      end: endMock,
    });
  });

  test('resolves the default reader role name and TM env fallback connection string', () => {
    const { DEFAULT_DB_READER_USERNAME, resolveBootstrapConfig } = loadModule();

    expect(
      resolveBootstrapConfig({
        TM_DB_HOST: 'tm.db.host',
        TM_DB_PORT: '5433',
        TM_DB_USER: 'bootstrap-user',
        TM_DB_PASSWORD: 's3cret',
        TM_DB_NAME: 'analytics_db',
        TM_DB_OPTIONS: '?sslmode=require',
      })
    ).toEqual({
      connectionString: 'postgresql://bootstrap-user:s3cret@tm.db.host:5433/analytics_db?sslmode=require',
      dbReaderUsername: DEFAULT_DB_READER_USERNAME,
    });
  });

  test('prefers an explicit bootstrap URL and supports password-less connection strings', () => {
    const { buildConnectionString } = loadModule();

    expect(
      buildConnectionString({
        TM_SCHEMA_PERMISSIONS_BOOTSTRAP_URL: 'postgresql://override.example/cft_task_db?sslmode=require',
        TM_DB_HOST: 'ignored.host',
      })
    ).toBe('postgresql://override.example/cft_task_db?sslmode=require');

    expect(
      buildConnectionString({
        TM_SCHEMA_PERMISSIONS_BOOTSTRAP_HOST: 'tm.db.host',
        TM_SCHEMA_PERMISSIONS_BOOTSTRAP_USER: 'readonly',
        TM_SCHEMA_PERMISSIONS_BOOTSTRAP_OPTIONS: '',
      })
    ).toBe('postgresql://readonly@tm.db.host:5432/cft_task_db');
  });

  test('validates role identifiers before passing them to pg escaping', () => {
    const { validateIdentifier } = loadModule();

    expect(validateIdentifier('DTS JIT Access wa DB Reader SC')).toBeUndefined();
    expect(validateIdentifier('Reader "SC"')).toBeUndefined();
    expect(() => validateIdentifier('   ')).toThrow(
      'TM schema permissions bootstrap requires a non-empty dbReaderUsername'
    );
  });

  test('normalises option environment inputs', () => {
    const { normaliseOptions } = loadModule();

    expect(normaliseOptions()).toBe('');
    expect(normaliseOptions(' ?sslmode=require')).toBe('sslmode=require');
  });

  test('supports default process environment resolution paths used by the CLI entrypoint', async () => {
    const previousEnvironment = process.env;
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    process.env = {
      ...previousEnvironment,
      TM_DB_HOST: 'tm.db.host',
      TM_DB_USER: 'bootstrap-user',
      TM_DB_NAME: 'analytics_db',
      TM_DB_OPTIONS: '',
    };

    try {
      const {
        DEFAULT_DB_READER_USERNAME,
        bootstrapTmSchemaPermissions,
        buildConnectionString,
        resolveBootstrapConfig,
        runFromEnvironment,
      } = loadModule();

      expect(buildConnectionString()).toBe('postgresql://bootstrap-user@tm.db.host:5432/analytics_db');
      expect(resolveBootstrapConfig()).toEqual({
        connectionString: 'postgresql://bootstrap-user@tm.db.host:5432/analytics_db',
        dbReaderUsername: DEFAULT_DB_READER_USERNAME,
      });

      await expect(runFromEnvironment()).resolves.toBeUndefined();

      expect(connectMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledWith('GRANT USAGE ON SCHEMA analytics TO "DTS JIT Access wa DB Reader SC"');
      await expect(
        bootstrapTmSchemaPermissions({
          connectionString: 'postgresql://bootstrap-user@tm.db.host:5432/analytics_db',
          dbReaderUsername: DEFAULT_DB_READER_USERNAME,
        })
      ).resolves.toBeUndefined();
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'Granted TM analytics schema permissions to configured DB reader role',
        {
          dbReaderUsername: DEFAULT_DB_READER_USERNAME,
        }
      );
    } finally {
      process.env = previousEnvironment;
      consoleInfoSpy.mockRestore();
    }
  });

  test('runs the TM analytics schema grants inside a transaction', async () => {
    const logger = { info: jest.fn(), warn: jest.fn() };
    const { bootstrapTmSchemaPermissions } = loadModule();

    await bootstrapTmSchemaPermissions(
      {
        connectionString: 'postgresql://bootstrap-user:s3cret@tm.db.host:5432/cft_task_db?sslmode=require',
        dbReaderUsername: 'DTS JIT Access wa DB Reader SC',
      },
      { logger }
    );

    expect(clientConstructorMock).toHaveBeenCalledWith({
      connectionString: 'postgresql://bootstrap-user:s3cret@tm.db.host:5432/cft_task_db?sslmode=require',
    });
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(4);
    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock).toHaveBeenNthCalledWith(2, 'GRANT USAGE ON SCHEMA analytics TO "DTS JIT Access wa DB Reader SC"');
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      'GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO "DTS JIT Access wa DB Reader SC"'
    );
    expect(queryMock).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(logger.info).toHaveBeenCalledWith('Granted TM analytics schema permissions to configured DB reader role', {
      dbReaderUsername: 'DTS JIT Access wa DB Reader SC',
    });
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  test('fails fast without a resolvable connection string', async () => {
    const { runFromEnvironment } = loadModule();

    await expect(runFromEnvironment({})).rejects.toThrow(
      'Unable to resolve TM schema permissions bootstrap database URL'
    );

    expect(clientConstructorMock).not.toHaveBeenCalled();
  });

  test('rolls back and warns when a grant fails and the rollback also fails', async () => {
    const logger = { info: jest.fn(), warn: jest.fn() };
    const { bootstrapTmSchemaPermissions } = loadModule();
    const grantError = new Error('grant failed');
    const rollbackError = new Error('rollback failed');

    queryMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(grantError).mockRejectedValueOnce(rollbackError);

    await expect(
      bootstrapTmSchemaPermissions(
        {
          connectionString: 'postgresql://bootstrap-user:s3cret@tm.db.host:5432/cft_task_db?sslmode=require',
          dbReaderUsername: 'Reader "SC"',
        },
        { logger }
      )
    ).rejects.toThrow('grant failed');

    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock).toHaveBeenNthCalledWith(2, 'GRANT USAGE ON SCHEMA analytics TO "Reader ""SC"""');
    expect(queryMock).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to roll back TM schema permissions bootstrap transaction',
      rollbackError
    );
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
