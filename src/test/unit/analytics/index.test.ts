import { Request, Response, Router } from 'express';

import { createAnalyticsRouter } from '../../../main/modules/analytics';
import { completedController } from '../../../main/modules/analytics/completed/controller';
import { outstandingController } from '../../../main/modules/analytics/outstanding/controller';
import { overviewController } from '../../../main/modules/analytics/overview/controller';
import { userOverviewController } from '../../../main/modules/analytics/userOverview/controller';
import { csrfService } from '../../../main/modules/csrf';

jest.mock('../../../main/modules/csrf', () => ({
  csrfService: {
    getProtection: jest.fn(() => (req: Request, res: Response, next: () => void) => next()),
    getToken: jest.fn(),
  },
}));

const csrfServiceMock = csrfService as unknown as {
  getProtection: jest.Mock;
  getToken: jest.Mock;
};

jest.mock('../../../main/modules/analytics/overview/controller', () => ({
  overviewController: { registerOverviewRoutes: jest.fn() },
}));

jest.mock('../../../main/modules/analytics/outstanding/controller', () => ({
  outstandingController: { registerOutstandingRoutes: jest.fn() },
}));

jest.mock('../../../main/modules/analytics/completed/controller', () => ({
  completedController: { registerCompletedRoutes: jest.fn() },
}));

jest.mock('../../../main/modules/analytics/userOverview/controller', () => ({
  userOverviewController: { registerUserOverviewRoutes: jest.fn() },
}));

describe('createAnalyticsRouter', () => {
  type MiddlewareHandle = (req: Request, res: Response, next: () => void) => void;
  type RouterLayer = { route?: { path: string; stack: { handle: MiddlewareHandle }[] }; handle: MiddlewareHandle };

  test('registers middleware and sub-routes', () => {
    const router = createAnalyticsRouter();

    expect(csrfServiceMock.getProtection).toHaveBeenCalled();
    expect(overviewController.registerOverviewRoutes).toHaveBeenCalledWith(router);
    expect(outstandingController.registerOutstandingRoutes).toHaveBeenCalledWith(router);
    expect(completedController.registerCompletedRoutes).toHaveBeenCalledWith(router);
    expect(userOverviewController.registerUserOverviewRoutes).toHaveBeenCalledWith(router);
  });

  test('sets csrf token in locals middleware', () => {
    const router = createAnalyticsRouter();
    const middlewareLayers = (router as Router & { stack: RouterLayer[] }).stack.filter(layer => !layer.route);
    const req = {} as unknown as Request;
    csrfServiceMock.getToken.mockReturnValue('token');
    const localsLayer = middlewareLayers.find(layer => {
      const probeRes = { locals: {} } as unknown as Response;
      csrfServiceMock.getToken.mockClear();
      layer.handle(req, probeRes, jest.fn());
      return csrfServiceMock.getToken.mock.calls.length > 0;
    });

    expect(localsLayer).toBeDefined();

    const res = { locals: {} } as unknown as Response;
    const next = jest.fn();

    localsLayer?.handle(req, res, next);

    expect(csrfServiceMock.getToken).toHaveBeenCalledWith(req, res);
    expect(res.locals.csrfToken).toBe('token');
    expect(next).toHaveBeenCalled();
  });
});
