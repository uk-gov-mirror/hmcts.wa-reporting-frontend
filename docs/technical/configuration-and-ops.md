# Configuration and operations

## Configuration files
- `config/default.json` defines defaults for all runtime configuration (including local development defaults).
- `config/custom-environment-variables.yaml` maps config keys to environment variables for overrides.
- `charts/wa-reporting-frontend/values.yaml` and `charts/wa-reporting-frontend/values.preview.template.yaml` define Key Vault secret names that are injected into the app in non-local environments.

## Configuration flow and precedence
1. `config/default.json` provides the baseline values (used directly for local development).
2. Environment variables (wired via `config/custom-environment-variables.yaml`) override defaults.
3. For production-like environments, Key Vault secrets are declared in Helm values (`values.yaml` and `values.preview.template.yaml`) and loaded through Properties Volume under `secrets.wa.<secret-name>`.
4. Application code reads secrets directly from `secrets.wa.<secret-name>` paths.

## Retrieving config values in the app
Use the `config` package with dot-notation keys that match `config/default.json` paths:

```ts
import config from 'config';

const redisHost: string | undefined = config.get('secrets.wa.wa-reporting-redis-host');
const ttlSeconds: number = config.get<number>('analytics.cacheTtlSeconds');

if (config.has('secrets.wa.app-insights-connection-string')) {
  const connectionString = config.get<string>('secrets.wa.app-insights-connection-string');
}
```

Prefer `config.get<T>(...)` with explicit types for clarity, and `config.has(...)` when a value is optional. Secrets injected via Properties Volume are available through the `secrets.wa.*` keys.

## Key configuration areas

### Analytics
- `analytics.cacheTtlSeconds`: NodeCache TTL for filter options and reference data.
- `analytics.manageCaseBaseUrl`: base URL used for case links.
- `analytics.filtersCookieName`: name for filter persistence cookie.
- `analytics.filtersCookieMaxAgeDays`: cookie lifetime in days.
- `analytics.snapshotRefreshCronBootstrap.enabled`: enables/disables startup registration of snapshot refresh pg_cron jobs.
- `analytics.snapshotRefreshCronBootstrap.jobName`: pg_cron job name used for idempotent replace behavior.
- `analytics.snapshotRefreshCronBootstrap.schedule`: cron expression used for snapshot refresh execution.
- `analytics.snapshotRefreshCronBootstrap.targetDatabase`: database where `analytics.run_snapshot_refresh_batch()` executes.
- `analytics.snapshotRefreshCronBootstrap.cronDatabase`: database where pg_cron metadata/functions are available (default `postgres`).

### Authentication
- `auth.enabled`: enables/disables OIDC and RBAC.
- `services.idam.clientID`, `scope`.
- `services.idam.url.public`: IDAM base URL.
- `services.idam.url.wa`: base URL of this application.
- `RBAC.access`: required role for access.
- `secrets.wa.wa-reporting-frontend-client-secret`: IDAM client secret.

### Session
- `secrets.wa.wa-reporting-frontend-session-secret`: session signing secret.
- `session.cookie.name`: cookie for OIDC session.
- `session.appCookie.name`: cookie for app session.
- `secrets.wa.wa-reporting-redis-host`, `wa-reporting-redis-port`, `wa-reporting-redis-access-key`: Redis connection for session storage.

### Database
- `database.tm`, `database.crd`, `database.lrd`: PostgreSQL connection details.
- Supports `url` overrides and `schema` for search_path.
- `secrets.wa.tm-db-user`/`secrets.wa.tm-db-password`: TM database credentials.
- `secrets.wa.crd-db-user`/`secrets.wa.crd-db-password`: CRD database credentials.
- `secrets.wa.lrd-db-user`/`secrets.wa.lrd-db-password`: LRD database credentials.
- Terraform reads the source credentials from Key Vault `rd-<env>` and writes them into WA Key Vault under the repo key names:
  - `caseworker-ref-api-POSTGRES-USER` -> `rd-caseworker-ref-api-POSTGRES-USER`
  - `caseworker-ref-api-POSTGRES-PASS` -> `rd-caseworker-ref-api-POSTGRES-PASS`
  - `location-ref-api-POSTGRES-USER` -> `rd-location-ref-api-POSTGRES-USER`
  - `location-ref-api-POSTGRES-PASS` -> `rd-location-ref-api-POSTGRES-PASS`

### Security and logging
- `useCSRFProtection`.
- `compression.enabled`: enables/disables HTTP compression middleware (default `false`).
- `security.referrerPolicy` and HSTS settings.
- `logging.prismaQueryTimings`: Prisma query timing log settings.
  - `enabled`: turns Prisma query timing logs on/off.
  - `minDurationMs`: logs only queries with duration at or above this value.
  - `slowQueryThresholdMs`: logs queries at or above this value as slow-query events.
  - `includeQueryPreview`: includes a normalised SQL preview string in logs when `true`.
  - `queryPreviewMaxLength`: max characters in the SQL preview string.
- `secrets.wa.app-insights-connection-string` for Azure Application Insights.

## Environment variables (selected)
- `AUTH_ENABLED`
- `COMPRESSION_ENABLED`
- `ANALYTICS_CACHE_TTL_SECONDS`
- `ANALYTICS_CACHE_WARMUP_ENABLED`
- `ANALYTICS_CACHE_WARMUP_CRON_EXPRESSION`
- `SNAPSHOT_REFRESH_CRON_BOOTSTRAP_ENABLED`
- `SNAPSHOT_REFRESH_CRON_JOB_NAME`
- `SNAPSHOT_REFRESH_CRON_SCHEDULE`
- `SNAPSHOT_REFRESH_CRON_TARGET_DATABASE`
- `SNAPSHOT_REFRESH_CRON_DATABASE`
- `LOGGING_PRISMA_QUERY_TIMINGS_ENABLED`
- `LOGGING_PRISMA_QUERY_TIMINGS_MIN_DURATION_MS`
- `LOGGING_PRISMA_QUERY_TIMINGS_SLOW_QUERY_THRESHOLD_MS`
- `LOGGING_PRISMA_QUERY_TIMINGS_INCLUDE_QUERY_PREVIEW`
- `LOGGING_PRISMA_QUERY_TIMINGS_QUERY_PREVIEW_MAX_LENGTH`
- `APPLICATIONINSIGHTS_CONNECTION_STRING`
- `IDAM_CLIENT_ID`, `WA_REPORTING_FRONTEND_CLIENT_SECRET`, `IDAM_CLIENT_SCOPE`
- `IDAM_PUBLIC_URL`, `WA_BASE_URL`
- `TM_DB_*`, `CRD_DB_*`, `LRD_DB_*`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_KEY`
- `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_APP_COOKIE_NAME`

## Secrets via Properties Volume
When not in development, `PropertiesVolume` loads Kubernetes secrets into the configuration under `secrets.wa.*`, including:
- IDAM client secret
- Session secret
- Redis credentials
- Database credentials

Keep the Key Vault secret lists in `charts/wa-reporting-frontend/values.yaml` and `charts/wa-reporting-frontend/values.preview.template.yaml` aligned with the secrets consumed by the app. Any new secret must be added in all three places.

## Build and runtime

### Build
- `yarn build` builds frontend assets via webpack.
- `yarn build:watch` rebuilds frontend assets continuously via webpack watch mode.
- `yarn build:server` compiles server TypeScript to `dist/`.
- `yarn build:prod` builds assets and copies views/public into `dist/main`.

### Run
- `yarn start` runs the compiled server from `dist/main/server.js`.
- `yarn start:dev` runs via nodemon with webpack dev middleware.
- For local frontend iteration, run `yarn build:watch` and `yarn start:dev` in separate terminals to keep on-disk bundles current while developing.
- Default port is 3100 (configurable via `PORT`).
- Express trusts one proxy hop (`trust proxy = 1`) to support AKS/ingress `X-Forwarded-For` headers.

### Health and info endpoints
- `/health` returns liveness and readiness checks.
- `/info` returns build and runtime metadata.
- When Redis is configured, `/health` includes a Redis ping check in both liveness and readiness.

### Logging and monitoring
- Uses a local Winston 3 logger wrapper for server logs. `LOG_LEVEL` controls verbosity (default `info`), and `JSON_PRINT=true` enables JSON output.
- When `logging.prismaQueryTimings.enabled=true`, Prisma query events are emitted as:
  - `db.query` for timings at or above `minDurationMs` and below `slowQueryThresholdMs`.
  - `db.query.slow` for timings at or above `slowQueryThresholdMs`.
  Payload fields include `database` (`tm`/`crd`/`lrd`), `durationMs`, `target`, `queryFingerprint`, and optional `queryPreview` when enabled.
- OpenTelemetry (Azure Monitor) exports traces and logs to Application Insights when a connection string is available from `APPLICATIONINSIGHTS_CONNECTION_STRING` or `secrets.wa.app-insights-connection-string`.
- In non-development environments, startup loads Properties Volume secrets into `config` before OpenTelemetry initialisation, so mounted Key Vault values are available during telemetry setup.
- The service name is configured in code as `wa-reporting-frontend`.

### Snapshot refresh cron bootstrap
- When `analytics.snapshotRefreshCronBootstrap.enabled=true`, app startup attempts to register the snapshot refresh schedule via `cron.schedule_in_database(...)`.
- Registration uses TM connection credentials and host settings, with the database name overridden to `analytics.snapshotRefreshCronBootstrap.cronDatabase` (default `postgres`).
- Registration is non-fatal: startup logs failures and continues serving requests.
- Startup registration is idempotent: existing jobs matching `jobName` and `targetDatabase` are unscheduled before registering the configured definition.
- Prerequisites:
  - `pg_cron` extension and `cron` schema/functions are available in `cronDatabase`.
  - The application DB role has permissions to read from `cron.job` and execute `cron.unschedule(...)` / `cron.schedule_in_database(...)`.
