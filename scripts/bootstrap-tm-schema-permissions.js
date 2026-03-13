const { Client, escapeIdentifier } = require('pg');

const DEFAULT_DB_READER_USERNAME = 'DTS JIT Access wa DB Reader SC';
const DEFAULT_TM_DATABASE = 'cft_task_db';
const DEFAULT_TM_PORT = '5432';
const DEFAULT_TM_OPTIONS = 'ssl=true&sslmode=require';

const firstDefined = (...values) => values.find(value => value !== undefined);

const normaliseOptions = options => {
  if (typeof options !== 'string') {
    return '';
  }

  const trimmedOptions = options.trim();
  if (!trimmedOptions) {
    return '';
  }

  return trimmedOptions.replace(/^\?+/, '');
};

const validateIdentifier = identifier => {
  if (typeof identifier !== 'string' || identifier.trim() === '') {
    throw new Error('TM schema permissions bootstrap requires a non-empty dbReaderUsername');
  }
};

const buildConnectionString = (env = process.env) => {
  if (env.TM_SCHEMA_PERMISSIONS_BOOTSTRAP_URL) {
    return env.TM_SCHEMA_PERMISSIONS_BOOTSTRAP_URL;
  }

  const host = firstDefined(
    env.TM_SCHEMA_PERMISSIONS_BOOTSTRAP_HOST,
    env.TM_DB_PRIMARY_HOST,
    env.TM_DB_REPLICA_HOST,
    env.TM_DB_HOST
  );
  const port = firstDefined(env.TM_SCHEMA_PERMISSIONS_BOOTSTRAP_PORT, env.TM_DB_PORT, DEFAULT_TM_PORT);
  const user = firstDefined(env.TM_SCHEMA_PERMISSIONS_BOOTSTRAP_USER, env.TM_DB_MIGRATION_USER, env.TM_DB_USER);
  const password = firstDefined(
    env.TM_SCHEMA_PERMISSIONS_BOOTSTRAP_PASSWORD,
    env.TM_DB_MIGRATION_PASSWORD,
    env.TM_DB_PASSWORD
  );
  const database = firstDefined(env.TM_SCHEMA_PERMISSIONS_BOOTSTRAP_DATABASE, env.TM_DB_NAME, DEFAULT_TM_DATABASE);
  const options = normaliseOptions(
    firstDefined(env.TM_SCHEMA_PERMISSIONS_BOOTSTRAP_OPTIONS, env.TM_DB_OPTIONS, DEFAULT_TM_OPTIONS)
  );

  if (!host || !user || !database) {
    return undefined;
  }

  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  const connectionString = `postgresql://${auth}@${host}:${port}/${database}`;

  return options ? `${connectionString}?${options}` : connectionString;
};

const resolveBootstrapConfig = (env = process.env) => ({
  connectionString: buildConnectionString(env),
  dbReaderUsername: env.TM_SCHEMA_PERMISSIONS_DB_READER_USERNAME || DEFAULT_DB_READER_USERNAME,
});

const bootstrapTmSchemaPermissions = async (
  config = resolveBootstrapConfig(),
  { ClientCtor = Client, logger = console } = {}
) => {
  if (!config.connectionString) {
    throw new Error('Unable to resolve TM schema permissions bootstrap database URL');
  }

  const client = new ClientCtor({ connectionString: config.connectionString });
  validateIdentifier(config.dbReaderUsername);
  const quotedDbReaderUsername = escapeIdentifier(config.dbReaderUsername);

  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`GRANT USAGE ON SCHEMA analytics TO ${quotedDbReaderUsername}`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO ${quotedDbReaderUsername}`);
    await client.query('COMMIT');

    logger.info('Granted TM analytics schema permissions to configured DB reader role', {
      dbReaderUsername: config.dbReaderUsername,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.warn('Failed to roll back TM schema permissions bootstrap transaction', rollbackError);
    }

    throw error;
  } finally {
    await client.end();
  }
};

const runFromEnvironment = async (env = process.env, dependencies = {}) =>
  bootstrapTmSchemaPermissions(resolveBootstrapConfig(env), dependencies);

module.exports = {
  DEFAULT_DB_READER_USERNAME,
  buildConnectionString,
  bootstrapTmSchemaPermissions,
  normaliseOptions,
  resolveBootstrapConfig,
  runFromEnvironment,
  validateIdentifier,
};

/* istanbul ignore next */
if (require.main === module) {
  void runFromEnvironment().catch(error => {
    console.error('TM schema permissions bootstrap failed', error);
    process.exitCode = 1;
  });
}
