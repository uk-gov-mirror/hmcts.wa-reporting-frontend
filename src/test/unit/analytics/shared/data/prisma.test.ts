import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prismaPgMock = jest.fn().mockImplementation(config => ({ config }));
const loggerInfoMock = jest.fn();
const loggerWarnMock = jest.fn();

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: prismaPgMock,
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ $on: jest.fn() })),
  Prisma: {
    sql: jest.fn(),
    join: jest.fn(),
    raw: jest.fn(),
  },
}));
jest.mock('../../../../../main/modules/logging', () => ({
  Logger: {
    getLogger: jest.fn(() => ({ info: loggerInfoMock, warn: loggerWarnMock })),
  },
}));

describe('analytics prisma configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  const defaultPrismaQueryTimingsConfig = {
    enabled: false,
    minDurationMs: 0,
    slowQueryThresholdMs: 500,
    includeQueryPreview: false,
    queryPreviewMaxLength: 240,
  };

  const loadModule = (configValues: Record<string, unknown>) => {
    const resolvedConfigValues: Record<string, unknown> = {
      'logging.prismaQueryTimings': defaultPrismaQueryTimingsConfig,
      ...configValues,
    };

    jest.doMock('config', () => ({
      has: (path: string) => Object.prototype.hasOwnProperty.call(resolvedConfigValues, path),
      get: (path: string) => resolvedConfigValues[path],
    }));

    let exports: typeof import('../../../../../main/modules/analytics/shared/data/prisma') | undefined;
    jest.isolateModules(() => {
      jest.doMock('@prisma/client', () => ({
        PrismaClient,
        Prisma: {
          sql: jest.fn(),
          join: jest.fn(),
          raw: jest.fn(),
        },
      }));
      exports = require('../../../../../main/modules/analytics/shared/data/prisma');
    });

    return exports!;
  };

  test('uses direct URLs when configured', () => {
    loadModule({
      'database.tm.url': 'postgres://tm',
      'database.crd.url': 'postgres://crd',
      'database.lrd.url': 'postgres://lrd',
    });

    expect(prismaPgMock).toHaveBeenNthCalledWith(1, { connectionString: 'postgres://tm' });
    expect(prismaPgMock).toHaveBeenNthCalledWith(2, { connectionString: 'postgres://crd' });
    expect(prismaPgMock).toHaveBeenNthCalledWith(3, { connectionString: 'postgres://lrd' });
    expect(PrismaClient).toHaveBeenNthCalledWith(1, { adapter: prismaPgMock.mock.results[0].value });
    expect(PrismaClient).toHaveBeenNthCalledWith(2, { adapter: prismaPgMock.mock.results[1].value });
    expect(PrismaClient).toHaveBeenNthCalledWith(3, { adapter: prismaPgMock.mock.results[2].value });
  });

  test('builds a URL from host credentials when direct URL is missing', () => {
    loadModule({
      'database.tm.host': 'localhost',
      'database.tm.port': 5432,
      'secrets.wa.tm-db-user': 'user',
      'secrets.wa.tm-db-password': 'p@ss',
      'database.tm.db_name': 'tasks',
      'database.tm.schema': 'analytics',
    });

    expect(PrismaClient).toHaveBeenNthCalledWith(1, {
      adapter: prismaPgMock.mock.results[0].value,
    });
    expect(PrismaClient).toHaveBeenNthCalledWith(2);
    expect(PrismaClient).toHaveBeenNthCalledWith(3);
    expect(prismaPgMock).toHaveBeenCalledWith({
      connectionString: 'postgresql://user:p%40ss@localhost:5432/tasks?options=-csearch_path=analytics',
    });
  });

  test('builds a URL without password or schema when omitted', () => {
    loadModule({
      'database.tm.host': 'db.host',
      'secrets.wa.tm-db-user': 'readonly',
      'database.tm.db_name': 'tasks',
    });

    expect(PrismaClient).toHaveBeenNthCalledWith(1, {
      adapter: prismaPgMock.mock.results[0].value,
    });
    expect(prismaPgMock).toHaveBeenCalledWith({ connectionString: 'postgresql://readonly@db.host:5432/tasks' });
  });

  test('builds a URL with options when configured', () => {
    loadModule({
      'database.tm.host': 'db.host',
      'secrets.wa.tm-db-user': 'readonly',
      'database.tm.db_name': 'tasks',
      'database.tm.options': 'sslmode=require',
      'database.tm.schema': 'analytics',
    });

    expect(prismaPgMock).toHaveBeenCalledWith({
      connectionString: 'postgresql://readonly@db.host:5432/tasks?sslmode=require&options=-csearch_path=analytics',
    });
  });

  test('overrides direct URL database name when requested', () => {
    const { buildDatabaseUrlFromConfig } = loadModule({
      'database.tm.url': 'postgresql://readonly@db.host:5432/tasks?sslmode=require',
    });

    expect(buildDatabaseUrlFromConfig('tm', { database: 'postgres' })).toBe(
      'postgresql://readonly@db.host:5432/postgres?sslmode=require'
    );
  });

  test('supports overriding database name and disabling schema in config-built URLs', () => {
    const { buildDatabaseUrlFromConfig } = loadModule({
      'database.tm.host': 'db.host',
      'database.tm.port': 5432,
      'secrets.wa.tm-db-user': 'readonly',
      'secrets.wa.tm-db-password': 'secret',
      'database.tm.db_name': 'tasks',
      'database.tm.schema': 'analytics',
      'database.tm.options': 'sslmode=require',
    });

    expect(buildDatabaseUrlFromConfig('tm', { database: 'postgres', schema: null })).toBe(
      'postgresql://readonly:secret@db.host:5432/postgres?sslmode=require'
    );
  });

  test('creates prisma clients with and without urls', () => {
    const { createPrismaClient } = loadModule({});

    jest.clearAllMocks();

    createPrismaClient('postgres://test');
    createPrismaClient();

    expect(prismaPgMock).toHaveBeenCalledWith({ connectionString: 'postgres://test' });
    expect(PrismaClient).toHaveBeenCalledWith({ adapter: prismaPgMock.mock.results[0].value });
    expect(PrismaClient).toHaveBeenCalledWith();
  });

  test('enables query logging when configured', () => {
    loadModule({
      'database.tm.url': 'postgres://tm',
      'logging.prismaQueryTimings': {
        ...defaultPrismaQueryTimingsConfig,
        enabled: true,
      },
    });

    expect(PrismaClient).toHaveBeenNthCalledWith(1, {
      adapter: prismaPgMock.mock.results[0].value,
      log: [{ emit: 'event', level: 'query' }],
    });

    const prismaClientMock = PrismaClient as jest.Mock;
    const prismaInstance = prismaClientMock.mock.results[0]?.value;
    expect(prismaInstance?.$on).toHaveBeenCalledWith('query', expect.any(Function));

    const queryHandler = (prismaInstance?.$on as jest.Mock).mock.calls[0]?.[1];
    queryHandler({
      duration: 42,
      target: 'task-manager',
      query: 'select 1',
    });

    expect(loggerInfoMock).toHaveBeenCalledWith('db.query', {
      database: 'tm',
      durationMs: 42,
      target: 'task-manager',
      queryFingerprint: createHash('sha256').update('select 1').digest('hex'),
    });
  });

  test('supports object config with min duration, slow threshold and query preview', () => {
    loadModule({
      'database.tm.url': 'postgres://tm',
      'logging.prismaQueryTimings': {
        enabled: true,
        minDurationMs: 50,
        slowQueryThresholdMs: 120,
        includeQueryPreview: true,
        queryPreviewMaxLength: 20,
      },
    });

    const prismaClientMock = PrismaClient as jest.Mock;
    const prismaInstance = prismaClientMock.mock.results[0]?.value;
    expect(prismaInstance?.$on).toHaveBeenCalledWith('query', expect.any(Function));

    const queryHandler = (prismaInstance?.$on as jest.Mock).mock.calls[0]?.[1];
    const query = 'SELECT   *\nFROM analytics.snapshot_task_rows WHERE case_id = $1';
    const normalisedQuery = 'SELECT * FROM analytics.snapshot_task_rows WHERE case_id = $1';

    queryHandler({
      duration: 49,
      target: 'task-manager',
      query,
    });
    expect(loggerInfoMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();

    queryHandler({
      duration: 60,
      target: 'task-manager',
      query,
    });
    expect(loggerInfoMock).toHaveBeenCalledWith('db.query', {
      database: 'tm',
      durationMs: 60,
      target: 'task-manager',
      queryFingerprint: createHash('sha256').update(normalisedQuery).digest('hex'),
      queryPreview: normalisedQuery.slice(0, 20),
    });
    expect(loggerWarnMock).not.toHaveBeenCalled();

    queryHandler({
      duration: 121,
      target: 'task-manager',
      query,
    });
    expect(loggerWarnMock).toHaveBeenCalledWith('db.query.slow', {
      database: 'tm',
      durationMs: 121,
      target: 'task-manager',
      queryFingerprint: createHash('sha256').update(normalisedQuery).digest('hex'),
      queryPreview: normalisedQuery.slice(0, 20),
    });
  });

  test('enforces slow threshold to be at least min duration', () => {
    loadModule({
      'database.tm.url': 'postgres://tm',
      'logging.prismaQueryTimings': {
        enabled: true,
        minDurationMs: 100,
        slowQueryThresholdMs: 50,
      },
    });

    const prismaClientMock = PrismaClient as jest.Mock;
    const prismaInstance = prismaClientMock.mock.results[0]?.value;
    const queryHandler = (prismaInstance?.$on as jest.Mock).mock.calls[0]?.[1];

    queryHandler({
      duration: 90,
      target: 'task-manager',
      query: 'SELECT 1',
    });
    expect(loggerInfoMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();

    queryHandler({
      duration: 100,
      target: 'task-manager',
      query: 'SELECT 1',
    });
    expect(loggerWarnMock).toHaveBeenCalledWith('db.query.slow', {
      database: 'tm',
      durationMs: 100,
      target: 'task-manager',
      queryFingerprint: createHash('sha256').update('SELECT 1').digest('hex'),
    });
  });

  test('supports query logging when client is created without an explicit URL', () => {
    const { createPrismaClient } = loadModule({
      'logging.prismaQueryTimings': {
        ...defaultPrismaQueryTimingsConfig,
        enabled: true,
      },
    });

    jest.clearAllMocks();

    const client = createPrismaClient(undefined, 'tm');

    expect(client).toBeDefined();
    expect(PrismaClient).toHaveBeenCalledWith({
      log: [{ emit: 'event', level: 'query' }],
    });
    expect(client.$on as jest.Mock).toHaveBeenCalledWith('query', expect.any(Function));
  });

  test('returns undefined when config is incomplete', () => {
    loadModule({
      'database.tm.host': 'db.host',
      'secrets.wa.tm-db-user': 'readonly',
    });

    expect(PrismaClient).toHaveBeenNthCalledWith(1);
  });
});
