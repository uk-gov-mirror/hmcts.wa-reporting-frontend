const queryRawMock = jest.fn();
const disconnectMock = jest.fn();
const createPrismaClientMock = jest.fn();
const buildDatabaseUrlFromConfigMock = jest.fn();
const getLoggerMock = jest.fn();
const loggerInfoMock = jest.fn();
const loggerWarnMock = jest.fn();
const loggerErrorMock = jest.fn();

jest.mock('../../../../../main/modules/analytics/shared/data/prisma', () => ({
  createPrismaClient: (...args: unknown[]) => createPrismaClientMock(...args),
  buildDatabaseUrlFromConfig: (...args: unknown[]) => buildDatabaseUrlFromConfigMock(...args),
}));

jest.mock('../../../../../main/modules/logging', () => ({
  Logger: {
    getLogger: (...args: unknown[]) =>
      getLoggerMock(...args) ?? {
        info: loggerInfoMock,
        warn: loggerWarnMock,
        error: loggerErrorMock,
      },
  },
}));

type CronBootstrapConfig = {
  enabled: boolean;
  jobName: string;
  schedule: string;
  targetDatabase: string;
  cronDatabase: string;
};

const defaultBootstrapConfig: CronBootstrapConfig = {
  enabled: true,
  jobName: 'analytics_snapshot_refresh_batch',
  schedule: '*/30 * * * *',
  targetDatabase: 'cft_task_db',
  cronDatabase: 'postgres',
};

const loadModule = (bootstrapConfig: CronBootstrapConfig) => {
  jest.doMock('config', () => ({
    get: (path: string) => {
      if (path === 'analytics.snapshotRefreshCronBootstrap') {
        return bootstrapConfig;
      }
      return undefined;
    },
  }));

  let moduleExports:
    | typeof import('../../../../../main/modules/analytics/shared/data/snapshotRefreshCronBootstrap')
    | undefined;
  jest.isolateModules(() => {
    moduleExports = require('../../../../../main/modules/analytics/shared/data/snapshotRefreshCronBootstrap');
  });

  return moduleExports!;
};

describe('snapshotRefreshCronBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    getLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    createPrismaClientMock.mockReturnValue({
      $queryRaw: queryRawMock,
      $disconnect: disconnectMock,
    });
    disconnectMock.mockResolvedValue(undefined);
    buildDatabaseUrlFromConfigMock.mockReturnValue('postgresql://readonly@db.host:5432/postgres');
  });

  test('skips startup registration when disabled', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule({
      ...defaultBootstrapConfig,
      enabled: false,
    });

    await bootstrapSnapshotRefreshCron();

    expect(getLoggerMock).toHaveBeenCalledWith('snapshot-refresh-cron-bootstrap');
    expect(buildDatabaseUrlFromConfigMock).not.toHaveBeenCalled();
    expect(createPrismaClientMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Snapshot refresh cron bootstrap disabled; skipping startup registration'
    );
  });

  test('registers snapshot refresh job through schedule_in_database', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);

    queryRawMock
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ jobid: 42 }])
      .mockResolvedValueOnce([]);

    await bootstrapSnapshotRefreshCron();

    expect(buildDatabaseUrlFromConfigMock).toHaveBeenCalledWith('tm', { database: 'postgres', schema: null });
    expect(createPrismaClientMock).toHaveBeenCalledWith('postgresql://readonly@db.host:5432/postgres', 'unknown');
    expect(queryRawMock).toHaveBeenCalledTimes(4);

    const lockQuery = queryRawMock.mock.calls[0][0];
    expect(lockQuery.strings.join('')).toContain('pg_try_advisory_lock');
    expect(lockQuery.values).toEqual(['analytics_snapshot_refresh_cron_bootstrap_lock']);

    const scheduleQuery = queryRawMock.mock.calls[2][0];
    expect(scheduleQuery.strings.join('')).toContain('cron.schedule_in_database');
    expect(scheduleQuery.values).toEqual([
      'analytics_snapshot_refresh_batch',
      '*/30 * * * *',
      'CALL analytics.run_snapshot_refresh_batch()',
      'cft_task_db',
    ]);

    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Registered snapshot refresh cron job at startup',
      expect.objectContaining({
        jobId: 42,
        jobName: 'analytics_snapshot_refresh_batch',
        schedule: '*/30 * * * *',
        targetDatabase: 'cft_task_db',
        cronDatabase: 'postgres',
      })
    );
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  test('runs unschedule query before schedule query', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);

    queryRawMock
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ jobid: 84 }])
      .mockResolvedValueOnce([]);

    await bootstrapSnapshotRefreshCron();

    const unscheduleQuery = queryRawMock.mock.calls[1][0];
    const scheduleQuery = queryRawMock.mock.calls[2][0];

    expect(unscheduleQuery.strings.join('')).toContain('cron.unschedule');
    expect(scheduleQuery.strings.join('')).toContain('cron.schedule_in_database');
  });

  test('skips scheduling when advisory lock cannot be acquired', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);

    queryRawMock.mockResolvedValueOnce([{ acquired: false }]);

    await bootstrapSnapshotRefreshCron();

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Skipping snapshot refresh cron bootstrap because advisory lock was not acquired',
      expect.objectContaining({
        jobName: 'analytics_snapshot_refresh_batch',
        targetDatabase: 'cft_task_db',
        cronDatabase: 'postgres',
      })
    );
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  test('skips scheduling when advisory lock row is missing', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);

    queryRawMock.mockResolvedValueOnce([]);

    await expect(bootstrapSnapshotRefreshCron()).resolves.toBeUndefined();

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  test('logs success with undefined job id when scheduler returns no rows', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);

    queryRawMock
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await bootstrapSnapshotRefreshCron();

    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Registered snapshot refresh cron job at startup',
      expect.objectContaining({
        jobId: undefined,
        jobName: 'analytics_snapshot_refresh_batch',
      })
    );
  });

  test('logs and continues when schedule registration fails and still cleans up resources', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);

    queryRawMock
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('schedule failed'))
      .mockResolvedValueOnce([]);

    await bootstrapSnapshotRefreshCron();

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to bootstrap snapshot refresh cron registration',
      expect.objectContaining({
        jobName: 'analytics_snapshot_refresh_batch',
        schedule: '*/30 * * * *',
        targetDatabase: 'cft_task_db',
        cronDatabase: 'postgres',
      })
    );
    expect(queryRawMock).toHaveBeenCalledTimes(4);
    const unlockQuery = queryRawMock.mock.calls[3][0];
    expect(unlockQuery.strings.join('')).toContain('pg_advisory_unlock');
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  test('logs and returns when cron bootstrap URL cannot be built', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);
    buildDatabaseUrlFromConfigMock.mockReturnValue(undefined);

    await bootstrapSnapshotRefreshCron();

    expect(createPrismaClientMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith('Unable to resolve snapshot refresh cron bootstrap database URL');
  });

  test('logs warning when advisory unlock fails', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);

    queryRawMock
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ jobid: 42 }])
      .mockRejectedValueOnce(new Error('unlock failed'));

    await bootstrapSnapshotRefreshCron();

    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to release snapshot refresh cron bootstrap advisory lock',
      expect.any(Error)
    );
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  test('logs warning when prisma client disconnect fails', async () => {
    const { bootstrapSnapshotRefreshCron } = loadModule(defaultBootstrapConfig);
    disconnectMock.mockRejectedValueOnce(new Error('disconnect failed'));

    queryRawMock.mockResolvedValueOnce([{ acquired: false }]);

    await bootstrapSnapshotRefreshCron();

    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to disconnect snapshot refresh cron bootstrap Prisma client',
      expect.any(Error)
    );
  });
});
