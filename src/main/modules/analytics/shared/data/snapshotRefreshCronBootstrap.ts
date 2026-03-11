import { Prisma } from '@prisma/client';
import config from 'config';

import { buildDatabaseUrlFromConfig, createPrismaClient } from './prisma';

const { Logger } = require('../../../logging');

const logger = Logger.getLogger('snapshot-refresh-cron-bootstrap');

const SNAPSHOT_REFRESH_COMMAND = 'CALL analytics.run_snapshot_refresh_batch()';
const SNAPSHOT_REFRESH_CRON_BOOTSTRAP_LOCK_KEY = 'analytics_snapshot_refresh_cron_bootstrap_lock';

type SnapshotRefreshCronBootstrapConfig = {
  enabled: boolean;
  jobName: string;
  schedule: string;
  targetDatabase: string;
  cronDatabase: string;
};

type AdvisoryLockRow = {
  acquired: boolean;
};

type ScheduleRow = {
  jobid: bigint | number | string;
};

function getCronBootstrapConfig(): SnapshotRefreshCronBootstrapConfig {
  return config.get<SnapshotRefreshCronBootstrapConfig>('analytics.snapshotRefreshCronBootstrap');
}

export async function bootstrapSnapshotRefreshCron(): Promise<void> {
  const bootstrapConfig = getCronBootstrapConfig();
  if (!bootstrapConfig.enabled) {
    logger.info('Snapshot refresh cron bootstrap disabled; skipping startup registration');
    return;
  }

  const cronDatabaseUrl = buildDatabaseUrlFromConfig('tm', {
    database: bootstrapConfig.cronDatabase,
    schema: null,
  });
  if (!cronDatabaseUrl) {
    logger.error('Unable to resolve snapshot refresh cron bootstrap database URL');
    return;
  }

  const cronPrisma = createPrismaClient(cronDatabaseUrl, 'unknown');
  let lockAcquired = false;

  try {
    const lockRows = await cronPrisma.$queryRaw<AdvisoryLockRow[]>(Prisma.sql`
      SELECT pg_try_advisory_lock(hashtext(${SNAPSHOT_REFRESH_CRON_BOOTSTRAP_LOCK_KEY})) AS acquired
    `);
    lockAcquired = lockRows[0]?.acquired === true;

    if (!lockAcquired) {
      logger.info('Skipping snapshot refresh cron bootstrap because advisory lock was not acquired', {
        jobName: bootstrapConfig.jobName,
        targetDatabase: bootstrapConfig.targetDatabase,
        cronDatabase: bootstrapConfig.cronDatabase,
      });
      return;
    }

    await cronPrisma.$queryRaw(Prisma.sql`
      SELECT cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = ${bootstrapConfig.jobName}
        AND database = ${bootstrapConfig.targetDatabase}
    `);

    const scheduleRows = await cronPrisma.$queryRaw<ScheduleRow[]>(Prisma.sql`
      SELECT cron.schedule_in_database(
        ${bootstrapConfig.jobName},
        ${bootstrapConfig.schedule},
        ${SNAPSHOT_REFRESH_COMMAND},
        ${bootstrapConfig.targetDatabase}
      ) AS jobid
    `);
    const jobId = scheduleRows[0]?.jobid;

    logger.info('Registered snapshot refresh cron job at startup', {
      jobId,
      jobName: bootstrapConfig.jobName,
      schedule: bootstrapConfig.schedule,
      targetDatabase: bootstrapConfig.targetDatabase,
      cronDatabase: bootstrapConfig.cronDatabase,
    });
  } catch (error) {
    logger.error('Failed to bootstrap snapshot refresh cron registration', {
      jobName: bootstrapConfig.jobName,
      schedule: bootstrapConfig.schedule,
      targetDatabase: bootstrapConfig.targetDatabase,
      cronDatabase: bootstrapConfig.cronDatabase,
      error,
    });
  } finally {
    if (lockAcquired) {
      try {
        await cronPrisma.$queryRaw(Prisma.sql`
          SELECT pg_advisory_unlock(hashtext(${SNAPSHOT_REFRESH_CRON_BOOTSTRAP_LOCK_KEY}))
        `);
      } catch (unlockError) {
        logger.warn('Failed to release snapshot refresh cron bootstrap advisory lock', unlockError);
      }
    }

    try {
      await cronPrisma.$disconnect();
    } catch (disconnectError) {
      logger.warn('Failed to disconnect snapshot refresh cron bootstrap Prisma client', disconnectError);
    }
  }
}
