import { Request, Response, Router } from 'express';

import { overviewController } from '../../../../main/modules/analytics/overview/controller';
import { buildOverviewPage } from '../../../../main/modules/analytics/overview/page';
import { applyFilterCookieFromConfig } from '../../../../main/modules/analytics/shared/filterCookies';
import { createSnapshotToken } from '../../../../main/modules/analytics/shared/pageUtils';
import { getAjaxPartialTemplate, isAjaxRequest } from '../../../../main/modules/analytics/shared/partials';

jest.mock('../../../../main/modules/analytics/shared/filterCookies', () => ({
  applyFilterCookieFromConfig: jest.fn(),
  BASE_FILTER_KEYS: ['service', 'roleCategory', 'region', 'location', 'taskName', 'workType'],
}));

jest.mock('../../../../main/modules/analytics/overview/page', () => ({
  buildOverviewPage: jest.fn(),
}));

jest.mock('../../../../main/modules/analytics/shared/partials', () => ({
  getAjaxPartialTemplate: jest.fn(),
  isAjaxRequest: jest.fn(),
}));

describe('overviewController', () => {
  const buildRouter = () =>
    ({
      get: jest.fn(),
      post: jest.fn(),
    }) as unknown as Router;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registers routes and handles GET requests', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = { method: 'GET', query: { service: 'Tribunal' }, get: jest.fn() } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ service: ['Tribunal'] });
    (buildOverviewPage as jest.Mock).mockResolvedValue({ view: 'overview' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    overviewController.registerOverviewRoutes(router);

    expect(router.get).toHaveBeenCalledWith('/', expect.any(Function));
    expect(router.post).toHaveBeenCalledWith('/', expect.any(Function));

    const handler = (router.get as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(applyFilterCookieFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        res,
        source: req.query,
      })
    );
    expect(buildOverviewPage).toHaveBeenCalledWith({ service: ['Tribunal'] }, undefined, undefined);
    expect(getAjaxPartialTemplate).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith('analytics/overview/index', { view: 'overview' });
  });

  test('handles POST requests with body payloads', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = { method: 'POST', body: { location: 'Leeds' }, get: jest.fn() } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ location: ['Leeds'] });
    (buildOverviewPage as jest.Mock).mockResolvedValue({ view: 'overview-post' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    overviewController.registerOverviewRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(applyFilterCookieFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        res,
        source: req.body,
      })
    );
    expect(buildOverviewPage).toHaveBeenCalledWith({ location: ['Leeds'] }, undefined, undefined);
    expect(getAjaxPartialTemplate).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith('analytics/overview/index', { view: 'overview-post' });
  });

  test('renders task events partial for ajax requests', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = {
      method: 'POST',
      body: { service: 'Crime', ajaxSection: 'overview-task-events', snapshotToken: createSnapshotToken(44) },
      get: jest.fn().mockReturnValue('fetch'),
    } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ service: ['Crime'] });
    (buildOverviewPage as jest.Mock).mockResolvedValue({ view: 'overview-ajax' });
    (isAjaxRequest as jest.Mock).mockReturnValue(true);
    (getAjaxPartialTemplate as jest.Mock).mockReturnValue('analytics/overview/partials/task-events-table');

    overviewController.registerOverviewRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(buildOverviewPage).toHaveBeenCalledWith({ service: ['Crime'] }, 'overview-task-events', undefined, 44);
    expect(getAjaxPartialTemplate).toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith('analytics/overview/partials/task-events-table', { view: 'overview-ajax' });
  });

  test('falls back to full page when ajax template is missing', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = {
      method: 'POST',
      body: { ajaxSection: 'overview-task-events' },
      get: jest.fn().mockReturnValue('fetch'),
    } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({});
    (buildOverviewPage as jest.Mock).mockResolvedValue({ view: 'overview-fallback' });
    (isAjaxRequest as jest.Mock).mockReturnValue(true);
    (getAjaxPartialTemplate as jest.Mock).mockReturnValue(undefined);

    overviewController.registerOverviewRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(render).toHaveBeenCalledWith('analytics/overview/index', { view: 'overview-fallback' });
  });
});
