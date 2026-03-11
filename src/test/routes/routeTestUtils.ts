import { Server } from 'http';

type RouteTestServer = {
  server: Server;
  close: () => Promise<void>;
};

type RouteAnalyticsMocks = {
  userOverviewAssignedTaskRows?: unknown[];
  userOverviewCompletedTaskRows?: unknown[];
  userOverviewAssignedTaskCount?: number;
  userOverviewCompletedTaskCount?: number;
  outstandingCriticalTaskRows?: unknown[];
  outstandingCriticalTaskCount?: number;
};

type RouteTestConfig = {
  authEnabled?: boolean;
  compressionEnabled?: boolean;
  analyticsMocks?: RouteAnalyticsMocks;
};

function setRouteTestConfig({ authEnabled = false, compressionEnabled = false }: RouteTestConfig): void {
  process.env.AUTH_ENABLED = authEnabled ? 'true' : 'false';
  process.env.COMPRESSION_ENABLED = compressionEnabled ? 'true' : 'false';
  process.env.NODE_CONFIG = JSON.stringify({
    auth: { enabled: authEnabled },
    compression: { enabled: compressionEnabled },
    useCSRFProtection: true,
  });

  const globalState = globalThis as unknown as {
    __setRouteTestConfigValues?: (next: Record<string, unknown>) => void;
  };
  globalState.__setRouteTestConfigValues?.({
    'auth.enabled': authEnabled,
    'compression.enabled': compressionEnabled,
  });
}

function mockOidcMiddleware(): void {
  jest.doMock('../../main/modules/oidc', () => {
    const { HTTPError } = require('../../main/HttpError');
    return {
      OidcMiddleware: class {
        enableFor(app: { use: (handler: (req: unknown, res: unknown, next: (err?: Error) => void) => void) => void }) {
          app.use((_req, _res, next) => next(new HTTPError('Forbidden', 403)));
        }
      },
    };
  });
}

function mockAnalyticsRepositories(analyticsMocks: RouteAnalyticsMocks = {}): void {
  const userOverviewAssignedTaskRows = analyticsMocks.userOverviewAssignedTaskRows ?? [];
  const userOverviewCompletedTaskRows = analyticsMocks.userOverviewCompletedTaskRows ?? [];
  const userOverviewAssignedTaskCount = analyticsMocks.userOverviewAssignedTaskCount ?? 0;
  const userOverviewCompletedTaskCount = analyticsMocks.userOverviewCompletedTaskCount ?? 0;
  const outstandingCriticalTaskRows = analyticsMocks.outstandingCriticalTaskRows ?? [];
  const outstandingCriticalTaskCount = analyticsMocks.outstandingCriticalTaskCount ?? 0;

  jest.doMock('../../main/modules/analytics/shared/repositories/taskFactsRepository', () => ({
    taskFactsRepository: {
      fetchServiceOverviewRows: jest.fn().mockResolvedValue([]),
      fetchTaskEventsByServiceRows: jest.fn().mockResolvedValue([]),
      fetchOverviewFilterOptionsRows: jest.fn().mockResolvedValue({
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        assignees: [],
      }),
      fetchOpenTasksCreatedByAssignmentRows: jest.fn().mockResolvedValue([]),
      fetchOpenTasksByNameRows: jest.fn().mockResolvedValue([]),
      fetchOpenTasksByRegionLocationRows: jest.fn().mockResolvedValue([]),
      fetchOpenTasksSummaryRows: jest.fn().mockResolvedValue([]),
      fetchTasksDuePriorityRows: jest.fn().mockResolvedValue([]),
      fetchCompletedSummaryRows: jest.fn().mockResolvedValue([]),
      fetchCompletedTimelineRows: jest.fn().mockResolvedValue([]),
      fetchCompletedProcessingHandlingTimeRows: jest.fn().mockResolvedValue([]),
      fetchCompletedByNameRows: jest.fn().mockResolvedValue([]),
      fetchCompletedByLocationRows: jest.fn().mockResolvedValue([]),
      fetchCompletedByRegionRows: jest.fn().mockResolvedValue([]),
      fetchUserOverviewCompletedTaskCount: jest.fn().mockResolvedValue(userOverviewCompletedTaskCount),
    },
  }));

  jest.doMock('../../main/modules/analytics/shared/repositories/taskThinRepository', () => ({
    taskThinRepository: {
      fetchUserOverviewAssignedTaskRows: jest.fn().mockResolvedValue(userOverviewAssignedTaskRows),
      fetchUserOverviewCompletedTaskRows: jest.fn().mockResolvedValue(userOverviewCompletedTaskRows),
      fetchUserOverviewAssignedTaskCount: jest.fn().mockResolvedValue(userOverviewAssignedTaskCount),
      fetchUserOverviewCompletedTaskCount: jest.fn().mockResolvedValue(userOverviewCompletedTaskCount),
      fetchUserOverviewCompletedByDateRows: jest.fn().mockResolvedValue([]),
      fetchUserOverviewCompletedByTaskNameRows: jest.fn().mockResolvedValue([]),
      fetchCompletedTaskAuditRows: jest.fn().mockResolvedValue([]),
      fetchOutstandingCriticalTaskRows: jest.fn().mockResolvedValue(outstandingCriticalTaskRows),
      fetchOutstandingCriticalTaskCount: jest.fn().mockResolvedValue(outstandingCriticalTaskCount),
      fetchWaitTimeByAssignedDateRows: jest.fn().mockResolvedValue([]),
      fetchTasksDueByDateRows: jest.fn().mockResolvedValue([]),
      fetchAssigneeIds: jest.fn().mockResolvedValue([]),
    },
  }));

  jest.doMock('../../main/modules/analytics/shared/repositories/snapshotStateRepository', () => ({
    snapshotStateRepository: {
      fetchPublishedSnapshot: jest.fn().mockResolvedValue({
        snapshotId: 1,
        publishedAt: new Date('2026-02-17T10:15:00.000Z'),
      }),
      fetchSnapshotById: jest.fn().mockResolvedValue({
        snapshotId: 1,
        publishedAt: new Date('2026-02-17T10:15:00.000Z'),
      }),
    },
  }));

  jest.doMock('../../main/modules/analytics/shared/repositories/regionRepository', () => ({
    regionRepository: {
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
    },
  }));

  jest.doMock('../../main/modules/analytics/shared/repositories/courtVenueRepository', () => ({
    courtVenueRepository: {
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
    },
  }));

  jest.doMock('../../main/modules/analytics/shared/repositories/caseWorkerProfileRepository', () => ({
    caseWorkerProfileRepository: {
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
    },
  }));
}

export async function buildRouteTestServer(config: RouteTestConfig = {}): Promise<RouteTestServer> {
  jest.clearAllMocks();

  setRouteTestConfig(config);
  mockOidcMiddleware();
  mockAnalyticsRepositories(config.analyticsMocks);

  let app!: { listen: (port: number, host: string) => Server };
  let bootstrapPromise: Promise<void> | undefined;
  jest.isolateModules(() => {
    const appModule = require('../../main/app') as {
      app: { listen: (port: number, host: string) => Server };
      bootstrapPromise?: Promise<void>;
    };
    app = appModule.app;
    bootstrapPromise = appModule.bootstrapPromise;
  });
  await bootstrapPromise;
  const server: Server = app.listen(0, '127.0.0.1');
  if (!server.listening) {
    await new Promise<void>(resolve => {
      server.once('listening', () => resolve());
    });
  }

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(error => {
          if (!error || (error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
            resolve();
            return;
          }
          reject(error);
        });
      }),
  };
}

export function extractCsrfToken(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) {
    throw new Error('CSRF token not found in response HTML');
  }
  return match[1];
}

export function getFilterCookieName(): string {
  const config = require('config');
  return config.get('analytics.filtersCookieName');
}
