import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import config from 'config';

const { Logger } = require('../../../logging');

const logger = Logger.getLogger('db');

type PrismaDatabaseKey = 'tm' | 'crd' | 'lrd' | 'unknown';

type PrismaQueryTimingConfig = {
  enabled: boolean;
  minDurationMs: number;
  slowQueryThresholdMs: number;
  includeQueryPreview: boolean;
  queryPreviewMaxLength: number;
};

type DatabaseUrlOverrides = {
  database?: string;
  schema?: string | null;
};

function getConfigValue<T>(path: string): T | undefined {
  return config.has(path) ? config.get<T>(path) : undefined;
}

function overrideDatabaseNameInUrl(connectionString: string, databaseName: string): string {
  try {
    const parsedUrl = new URL(connectionString);
    parsedUrl.pathname = `/${databaseName}`;
    return parsedUrl.toString();
  } catch {
    return connectionString;
  }
}

export function buildDatabaseUrlFromConfig(key: string, overrides: DatabaseUrlOverrides = {}): string | undefined {
  const prefix = `database.${key}`;
  const directUrl = getConfigValue<string>(`${prefix}.url`);
  if (directUrl) {
    return overrides.database ? overrideDatabaseNameInUrl(directUrl, overrides.database) : directUrl;
  }

  const host = getConfigValue<string>(`${prefix}.host`);
  const port = getConfigValue<number | string>(`${prefix}.port`) ?? '5432';
  const user = getConfigValue<string>(`secrets.wa.${key}-db-user`);
  const password = getConfigValue<string>(`secrets.wa.${key}-db-password`);
  const database = overrides.database ?? getConfigValue<string>(`${prefix}.db_name`);
  const schema = overrides.schema === undefined ? getConfigValue<string>(`${prefix}.schema`) : overrides.schema;
  const options = getConfigValue<string>(`${prefix}.options`);

  if (!host || !user || !database) {
    return undefined;
  }

  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  const optionsParams = [];
  if (options) {
    optionsParams.push(options);
  }
  if (schema) {
    optionsParams.push(`options=-csearch_path=${encodeURIComponent(schema)}`);
  }

  const optsString = optionsParams.length > 0 ? `?${optionsParams.join('&')}` : '';
  return `postgresql://${auth}@${host}:${port}/${database}${optsString}`;
}

function getPrismaQueryTimingConfig(): PrismaQueryTimingConfig {
  const settings = config.get<PrismaQueryTimingConfig>('logging.prismaQueryTimings');
  const minDurationMs = Math.max(0, Math.floor(settings.minDurationMs));
  const slowQueryThresholdMs = Math.max(minDurationMs, Math.max(0, Math.floor(settings.slowQueryThresholdMs)));
  const queryPreviewMaxLength = Math.max(1, Math.floor(settings.queryPreviewMaxLength));

  return {
    enabled: settings.enabled,
    minDurationMs,
    slowQueryThresholdMs,
    includeQueryPreview: settings.includeQueryPreview,
    queryPreviewMaxLength,
  };
}

function normaliseQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function createQueryFingerprint(query: string): string {
  return createHash('sha256').update(query).digest('hex');
}

function addQueryPreview(query: string, maxLength: number): string {
  if (query.length <= maxLength) {
    return query;
  }
  return query.slice(0, maxLength);
}

function bindQueryTimingLogger(
  client: PrismaClient,
  database: PrismaDatabaseKey,
  queryTimingConfig: PrismaQueryTimingConfig
): void {
  const queryEventClient = client as PrismaClient<Prisma.PrismaClientOptions, 'query'>;

  queryEventClient.$on('query', (event: Prisma.QueryEvent) => {
    if (event.duration < queryTimingConfig.minDurationMs) {
      return;
    }

    const normalisedQuery = normaliseQuery(event.query);
    const payload: Record<string, unknown> = {
      database,
      durationMs: event.duration,
      target: event.target,
      queryFingerprint: createQueryFingerprint(normalisedQuery),
    };
    if (queryTimingConfig.includeQueryPreview) {
      payload.queryPreview = addQueryPreview(normalisedQuery, queryTimingConfig.queryPreviewMaxLength);
    }

    if (event.duration >= queryTimingConfig.slowQueryThresholdMs) {
      logger.warn('db.query.slow', payload);
      return;
    }

    logger.info('db.query', payload);
  });
}

export function createPrismaClient(databaseUrl?: string, database: PrismaDatabaseKey = 'unknown'): PrismaClient {
  const queryTimingConfig = getPrismaQueryTimingConfig();
  const shouldLogQueries = queryTimingConfig.enabled;

  if (!databaseUrl) {
    if (!shouldLogQueries) {
      return new PrismaClient();
    }

    const client = new PrismaClient({
      log: [{ emit: 'event', level: 'query' }],
    });
    bindQueryTimingLogger(client, database, queryTimingConfig);
    return client;
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });

  if (!shouldLogQueries) {
    return new PrismaClient({ adapter });
  }

  const client = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  });
  bindQueryTimingLogger(client, database, queryTimingConfig);
  return client;
}

const tmDatabaseUrl = buildDatabaseUrlFromConfig('tm');
const crdDatabaseUrl = buildDatabaseUrlFromConfig('crd');
const lrdDatabaseUrl = buildDatabaseUrlFromConfig('lrd');

export const tmPrisma = createPrismaClient(tmDatabaseUrl, 'tm');
export const crdPrisma = createPrismaClient(crdDatabaseUrl, 'crd');
export const lrdPrisma = createPrismaClient(lrdDatabaseUrl, 'lrd');
