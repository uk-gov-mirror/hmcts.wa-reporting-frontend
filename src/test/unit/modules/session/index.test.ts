import type { Application } from 'express';

const expectSessionSecurityOptions = (sessionMiddleware: jest.Mock, store: unknown): void => {
  expect(sessionMiddleware).toHaveBeenCalledWith({
    name: 'app-cookie',
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
    },
  });
};

describe('AppSession module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('configures redis-backed sessions when redis is available', () => {
    const configValues: Record<string, unknown> = {
      'secrets.wa.wa-reporting-frontend-session-secret': 'secret',
      'session.appCookie.name': 'app-cookie',
      'secrets.wa.wa-reporting-redis-host': 'redis-host',
      'secrets.wa.wa-reporting-redis-port': 6379,
      'secrets.wa.wa-reporting-redis-access-key': 'redis-key',
    };

    const sessionMiddleware = jest.fn(() => 'session-middleware');
    const redisStore = jest.fn().mockImplementation(() => ({ store: 'redis' }));
    const redisClient = { connect: jest.fn().mockResolvedValue(undefined), on: jest.fn() };
    const createClient = jest.fn(() => redisClient);

    jest.doMock('config', () => ({
      get: jest.fn((key: string) => configValues[key]),
    }));
    jest.doMock('express-session', () => sessionMiddleware);
    jest.doMock('connect-redis', () => ({ RedisStore: redisStore }));
    jest.doMock('redis', () => ({ createClient }));
    jest.doMock('../../../../main/modules/logging', () => ({
      Logger: { getLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
    }));

    const app = { use: jest.fn(), locals: {} } as unknown as Application;

    jest.isolateModules(() => {
      const { AppSession } = require('../../../../main/modules/session');
      new AppSession().enableFor(app);
    });

    expect(createClient).toHaveBeenCalledWith({
      password: 'redis-key',
      socket: {
        host: 'redis-host',
        port: 6379,
        tls: true,
        connectTimeout: 5000,
        reconnectStrategy: expect.any(Function),
      },
    });
    expect(redisClient.connect).toHaveBeenCalled();
    expect(app.locals.appRedisClient).toBeDefined();
    expect(app.locals.redisConnectPromise).toBeDefined();
    expectSessionSecurityOptions(sessionMiddleware, { store: 'redis' });
    expect(app.use).toHaveBeenCalledWith('session-middleware');
  });

  it('configures redis without tls when access key is not provided', () => {
    const configValues: Record<string, unknown> = {
      'secrets.wa.wa-reporting-frontend-session-secret': 'secret',
      'session.appCookie.name': 'app-cookie',
      'secrets.wa.wa-reporting-redis-host': 'redis-host',
      'secrets.wa.wa-reporting-redis-port': 6379,
      'secrets.wa.wa-reporting-redis-access-key': '',
    };

    const sessionMiddleware = jest.fn(() => 'session-middleware');
    const redisStore = jest.fn().mockImplementation(() => ({ store: 'redis' }));
    const redisClient = { connect: jest.fn().mockResolvedValue(undefined), on: jest.fn() };
    const createClient = jest.fn(() => redisClient);

    jest.doMock('config', () => ({
      get: jest.fn((key: string) => configValues[key]),
    }));
    jest.doMock('express-session', () => sessionMiddleware);
    jest.doMock('connect-redis', () => ({ RedisStore: redisStore }));
    jest.doMock('redis', () => ({ createClient }));
    jest.doMock('../../../../main/modules/logging', () => ({
      Logger: { getLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
    }));

    const app = { use: jest.fn(), locals: {} } as unknown as Application;

    jest.isolateModules(() => {
      const { AppSession } = require('../../../../main/modules/session');
      new AppSession().enableFor(app);
    });

    expect(createClient).toHaveBeenCalledWith({
      socket: {
        host: 'redis-host',
        port: 6379,
        connectTimeout: 5000,
        reconnectStrategy: expect.any(Function),
      },
    });
    expect(redisClient.connect).toHaveBeenCalled();
    expect(app.locals.appRedisClient).toBeDefined();
    expect(app.locals.redisConnectPromise).toBeDefined();
    expectSessionSecurityOptions(sessionMiddleware, { store: 'redis' });
    expect(app.use).toHaveBeenCalledWith('session-middleware');
  });

  it('falls back to file store when redis is missing', () => {
    const configValues: Record<string, unknown> = {
      'secrets.wa.wa-reporting-frontend-session-secret': 'secret',
      'session.appCookie.name': 'app-cookie',
      'secrets.wa.wa-reporting-redis-host': undefined,
      'secrets.wa.wa-reporting-redis-port': undefined,
      'secrets.wa.wa-reporting-redis-access-key': undefined,
    };

    const sessionMiddleware = jest.fn(() => 'session-middleware');
    const fileStore = jest.fn().mockImplementation(() => ({ store: 'file' }));
    const fileStoreFactory = jest.fn(() => fileStore);

    jest.doMock('config', () => ({
      get: jest.fn((key: string) => configValues[key]),
    }));
    jest.doMock('express-session', () => sessionMiddleware);
    jest.doMock('session-file-store', () => fileStoreFactory);

    const app = { use: jest.fn(), locals: {} } as unknown as Application;

    jest.isolateModules(() => {
      const { AppSession } = require('../../../../main/modules/session');
      new AppSession().enableFor(app);
    });

    expect(fileStoreFactory).toHaveBeenCalled();
    expect(fileStore).toHaveBeenCalledWith({ path: '/tmp' });
    expectSessionSecurityOptions(sessionMiddleware, { store: 'file' });
    expect(app.use).toHaveBeenCalledWith('session-middleware');
  });
});
