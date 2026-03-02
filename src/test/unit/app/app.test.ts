import path from 'path';

import type { Express, Request, Response } from 'express';
import request from 'supertest';
const buildAppModule = async (options: {
  env?: string;
  authEnabled?: boolean;
  compressionEnabled?: boolean;
  routePaths?: string[];
  routeMocks?: Record<string, jest.Mock>;
  snapshotRefreshCronBootstrapError?: Error;
  snapshotRefreshCronBootstrapEnabled?: boolean;
}) => {
  const {
    env,
    authEnabled,
    compressionEnabled,
    routePaths = [],
    routeMocks = {},
    snapshotRefreshCronBootstrapError,
    snapshotRefreshCronBootstrapEnabled = false,
  } = options;

  if (env === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = env;
  }

  const setupDev = jest.fn();
  const enableFor = jest.fn();
  const appSessionEnableFor = jest.fn();
  const oidcEnableFor = jest.fn();
  const healthRoute = jest.fn();
  const infoRoute = jest.fn();
  const bootstrapSnapshotRefreshCron = jest.fn();
  const compressionMiddleware = jest.fn((_req: unknown, _res: unknown, next: () => void) => next());
  const compressionFactory = jest.fn(() => compressionMiddleware);

  if (snapshotRefreshCronBootstrapError) {
    bootstrapSnapshotRefreshCron.mockRejectedValue(snapshotRefreshCronBootstrapError);
  } else {
    bootstrapSnapshotRefreshCron.mockResolvedValue(undefined);
  }

  const configGet = jest.fn((key: string) => {
    if (key === 'auth.enabled') {
      return authEnabled;
    }
    if (key === 'compression.enabled') {
      return compressionEnabled;
    }
    if (key === 'security') {
      return { enabled: true };
    }
    if (key === 'analytics.snapshotRefreshCronBootstrap.enabled') {
      return snapshotRefreshCronBootstrapEnabled;
    }
    return undefined;
  });

  jest.doMock('config', () => ({
    get: configGet,
  }));

  jest.doMock('glob', () => ({
    glob: jest.fn().mockResolvedValue(routePaths),
  }));

  jest.doMock('compression', () => compressionFactory);

  routePaths.forEach(routePath => {
    const routeDefault = routeMocks[routePath] ?? jest.fn();
    jest.doMock(routePath, () => ({ default: routeDefault }), { virtual: true });
  });

  const logger = { error: jest.fn(), info: jest.fn() };

  jest.doMock('../../../main/modules/logging', () => ({
    Logger: {
      getLogger: jest.fn(() => logger),
    },
  }));

  jest.doMock('../../../main/modules/helmet', () => ({
    Helmet: jest.fn().mockImplementation(() => ({ enableFor })),
  }));

  jest.doMock('../../../main/modules/nunjucks', () => ({
    Nunjucks: jest.fn().mockImplementation(() => ({ enableFor })),
  }));

  jest.doMock('../../../main/modules/session', () => ({
    AppSession: jest.fn().mockImplementation(() => ({ enableFor: appSessionEnableFor })),
  }));

  jest.doMock('../../../main/modules/oidc', () => ({
    OidcMiddleware: jest.fn().mockImplementation(() => ({ enableFor: oidcEnableFor })),
  }));

  jest.doMock('../../../main/modules/properties-volume', () => ({
    PropertiesVolume: jest.fn().mockImplementation(() => ({ enableFor })),
  }));

  jest.doMock('../../../main/routes/health', () => ({
    __esModule: true,
    default: healthRoute,
  }));

  jest.doMock('../../../main/routes/info', () => ({
    __esModule: true,
    default: infoRoute,
  }));

  jest.doMock('../../../main/development', () => ({
    setupDev,
  }));

  jest.doMock('../../../main/modules/analytics/shared/data/snapshotRefreshCronBootstrap', () => ({
    bootstrapSnapshotRefreshCron,
  }));

  let app: Express | undefined;
  let bootstrap: (() => Promise<void>) | undefined;

  jest.isolateModules(() => {
    const appModule = require('../../../main/app');
    app = appModule.app;
    bootstrap = appModule.bootstrap;
  });

  if (!app || !bootstrap) {
    throw new Error('App not initialised');
  }

  await bootstrap();

  return {
    app,
    setupDev,
    enableFor,
    logger,
    appSessionEnableFor,
    oidcEnableFor,
    healthRoute,
    infoRoute,
    configGet,
    compressionFactory,
    bootstrapSnapshotRefreshCron,
  };
};

type RouterLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: (...args: unknown[]) => unknown }[];
  };
  handle?: (...args: unknown[]) => unknown;
};

type RouterStack = RouterLayer[];

const resolveRouterStack = (app: Express): RouterStack => {
  const expressApp = app as Express & { _router?: { stack: RouterStack }; router?: { stack: RouterStack } };
  if (!expressApp._router && !expressApp.router) {
    app.use((_req, _res, next) => next());
  }
  const router = expressApp._router ?? expressApp.router;
  if (!router) {
    throw new Error('Router not initialised');
  }
  return router.stack;
};

const getRouteHandler = (app: Express, routePath: string, method: 'get' | 'post' = 'get') => {
  const stack = resolveRouterStack(app);
  const layer = stack.find(
    (entry: RouterLayer) => entry.route && entry.route.path === routePath && entry.route.methods[method]
  );
  return layer?.route?.stack[layer.route.stack.length - 1].handle as (req: Request, res: Response) => unknown;
};

const getErrorHandler = (app: Express) => {
  const stack = resolveRouterStack(app);
  return stack.find((entry: RouterLayer) => entry.handle && entry.handle.length === 4)?.handle as (
    err: { message: string; status?: number; stack?: string },
    req: Request,
    res: Response,
    next: () => void
  ) => unknown;
};

const getNotFoundHandler = (app: Express) => {
  const stack = resolveRouterStack(app);
  const errorIndex = stack.findIndex((entry: RouterLayer) => entry.handle && entry.handle.length === 4);
  return stack[errorIndex - 1].handle as (req: Request, res: Response) => unknown;
};

describe('app bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('initialises middleware, locals, and dev setup in development mode', async () => {
    const {
      app,
      setupDev,
      enableFor,
      appSessionEnableFor,
      oidcEnableFor,
      healthRoute,
      infoRoute,
      bootstrapSnapshotRefreshCron,
    } = await buildAppModule({ env: 'development', snapshotRefreshCronBootstrapEnabled: true });

    expect(app.locals.ENV).toBe('development');
    expect(enableFor).toHaveBeenCalled();
    expect(appSessionEnableFor).toHaveBeenCalledWith(app);
    expect(oidcEnableFor).toHaveBeenCalledWith(app);
    expect(healthRoute).toHaveBeenCalledWith(app);
    expect(infoRoute).toHaveBeenCalledWith(app);
    expect(bootstrapSnapshotRefreshCron).toHaveBeenCalled();
    expect(setupDev).toHaveBeenCalledWith(app, true);
  });

  it('does not run snapshot refresh cron bootstrap when the feature is disabled', async () => {
    const { bootstrapSnapshotRefreshCron } = await buildAppModule({
      env: 'development',
      snapshotRefreshCronBootstrapEnabled: false,
    });

    expect(bootstrapSnapshotRefreshCron).not.toHaveBeenCalled();
  });

  it('logs and continues bootstrapping when snapshot refresh cron bootstrap rejects', async () => {
    const startupError = new Error('cron bootstrap failed');
    const { setupDev, logger, bootstrapSnapshotRefreshCron } = await buildAppModule({
      env: 'development',
      snapshotRefreshCronBootstrapEnabled: true,
      snapshotRefreshCronBootstrapError: startupError,
    });

    await Promise.resolve();

    expect(bootstrapSnapshotRefreshCron).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Snapshot refresh cron bootstrap failed during startup', startupError);
    expect(setupDev).toHaveBeenCalled();
  });

  it('uses production mode setup when NODE_ENV is not development', async () => {
    const { app, setupDev, appSessionEnableFor, oidcEnableFor } = await buildAppModule({
      env: 'production',
    });

    expect(app.locals.ENV).toBe('production');
    expect(appSessionEnableFor).toHaveBeenCalledWith(app);
    expect(oidcEnableFor).toHaveBeenCalledWith(app);
    expect(setupDev).toHaveBeenCalledWith(app, false);
  });

  it('skips OIDC when auth is disabled', async () => {
    const { oidcEnableFor } = await buildAppModule({
      env: 'development',
      authEnabled: false,
    });

    expect(oidcEnableFor).not.toHaveBeenCalled();
  });

  it('registers compression middleware when compression is enabled', async () => {
    const { compressionFactory } = await buildAppModule({
      env: 'development',
      compressionEnabled: true,
    });

    expect(compressionFactory).toHaveBeenCalled();
  });

  it('skips compression middleware when compression is disabled', async () => {
    const { compressionFactory } = await buildAppModule({
      env: 'development',
      compressionEnabled: false,
    });

    expect(compressionFactory).not.toHaveBeenCalled();
  });

  it('serves the default favicon', async () => {
    const { app } = await buildAppModule({ env: 'development' });

    const handler = getRouteHandler(app, '/favicon.ico');
    const sendFile = jest.fn();

    const req = {} as Request;
    const res = { sendFile } as unknown as Response;

    handler(req, res);

    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(sendFile.mock.calls[0][0]).toContain('images/favicon.ico');
  });

  it('defaults NODE_ENV to development when unset', async () => {
    const { app, setupDev } = await buildAppModule({});

    expect(app.locals.ENV).toBe('development');
    expect(setupDev).toHaveBeenCalledWith(app, true);
  });

  it('registers routes from glob and enables cache-control headers', async () => {
    const fakeRoutePath = path.join(process.cwd(), 'src/main/routes/__fake__.ts');
    const routeHandler = jest.fn((expressApp: Express) => {
      expressApp.get('/__cache-control-check__', (_req: Request, res: Response) => {
        res.status(200).send('ok');
      });
    });
    const { app, healthRoute, infoRoute, oidcEnableFor } = await buildAppModule({
      env: 'development',
      routePaths: [fakeRoutePath],
      routeMocks: { [fakeRoutePath]: routeHandler },
    });

    expect(routeHandler).toHaveBeenCalledWith(app);
    expect(healthRoute.mock.invocationCallOrder[0]).toBeLessThan(oidcEnableFor.mock.invocationCallOrder[0]);
    expect(infoRoute.mock.invocationCallOrder[0]).toBeLessThan(oidcEnableFor.mock.invocationCallOrder[0]);
    await request(app)
      .get('/__cache-control-check__')
      .expect(200)
      .expect('Cache-Control', 'no-cache, max-age=0, must-revalidate, no-store');
  });

  it('renders not found for unmatched routes', async () => {
    const { app } = await buildAppModule({ env: 'development' });
    const handler = getNotFoundHandler(app);

    const status = jest.fn().mockReturnThis();
    const render = jest.fn();
    const req = {} as Request;
    const res = { status, render } as unknown as Response;

    handler(req, res);

    expect(status).toHaveBeenCalledWith(404);
    expect(render).toHaveBeenCalledWith('not-found');
  });

  it('renders error details in development mode', async () => {
    const { app } = await buildAppModule({ env: 'development' });
    const handler = getErrorHandler(app);

    const err = { message: 'boom', status: 500, stack: 'trace' };
    const status = jest.fn().mockReturnThis();
    const render = jest.fn();
    const res = { locals: {}, status, render } as unknown as Response;

    handler(err, {} as Request, res, jest.fn());

    expect(res.locals.message).toBe('boom');
    expect(res.locals.error).toBe(err);
    expect(status).toHaveBeenCalledWith(500);
    expect(render).toHaveBeenCalledWith('error', {
      title: 'Sorry, there is a problem with the service',
      suggestions: ['Please try again later.'],
    });
  });

  it('suppresses error details outside development mode', async () => {
    const { app } = await buildAppModule({ env: 'production' });
    const handler = getErrorHandler(app);

    const err = { message: 'boom', status: 400, stack: 'trace' };
    const status = jest.fn().mockReturnThis();
    const render = jest.fn();
    const res = { locals: {}, status, render } as unknown as Response;

    handler(err, {} as Request, res, jest.fn());

    expect(res.locals.message).toBe('boom');
    expect(res.locals.error).toEqual({});
    expect(status).toHaveBeenCalledWith(400);
    expect(render).toHaveBeenCalledWith('error', {
      title: 'Sorry, there is a problem with the service',
      suggestions: ['Please try again later.'],
    });
  });

  it('defaults error status to 500 when missing', async () => {
    const { app } = await buildAppModule({ env: 'production' });
    const handler = getErrorHandler(app);

    const err = { message: 'boom', stack: 'trace' };
    const status = jest.fn().mockReturnThis();
    const render = jest.fn();
    const res = { locals: {}, status, render } as unknown as Response;

    handler(err, {} as Request, res, jest.fn());

    expect(status).toHaveBeenCalledWith(500);
  });

  it('logs the raw error when no stack is provided', async () => {
    const { app, logger } = await buildAppModule({ env: 'production' });
    const handler = getErrorHandler(app);

    const err = { message: 'boom', status: 500 };
    const status = jest.fn().mockReturnThis();
    const render = jest.fn();
    const res = { locals: {}, status, render } as unknown as Response;

    handler(err, {} as Request, res, jest.fn());

    expect(logger.error).toHaveBeenCalledWith('[object Object]');
  });

  it('renders a forbidden summary without logging an error', async () => {
    const { app, logger } = await buildAppModule({ env: 'production' });
    const handler = getErrorHandler(app);

    const err = { message: 'nope', status: 403 };
    const status = jest.fn().mockReturnThis();
    const render = jest.fn();
    const res = { locals: {}, status, render } as unknown as Response;

    handler(err, {} as Request, res, jest.fn());

    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalledWith('error', {
      title: 'Sorry, access to this resource is forbidden',
      suggestions: [
        'Please ensure you have the correct permissions to access this resource.',
        'Contact a system administrator if you should have access to this resource.',
      ],
      signOutUrl: '/logout',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
