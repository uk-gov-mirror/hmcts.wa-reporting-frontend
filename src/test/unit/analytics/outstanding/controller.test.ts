import { Request, Response, Router } from 'express';

import { outstandingController } from '../../../../main/modules/analytics/outstanding/controller';
import { parseCriticalTasksPage } from '../../../../main/modules/analytics/outstanding/criticalTasksPagination';
import { buildOutstandingPage } from '../../../../main/modules/analytics/outstanding/page';
import { applyFilterCookieFromConfig } from '../../../../main/modules/analytics/shared/filterCookies';
import { parseOutstandingSort } from '../../../../main/modules/analytics/shared/outstandingSort';
import { createSnapshotToken } from '../../../../main/modules/analytics/shared/pageUtils';
import { getAjaxPartialTemplate, isAjaxRequest } from '../../../../main/modules/analytics/shared/partials';

jest.mock('../../../../main/modules/analytics/shared/filterCookies', () => ({
  applyFilterCookieFromConfig: jest.fn(),
  BASE_FILTER_KEYS: ['service', 'roleCategory', 'region', 'location', 'taskName', 'workType'],
}));

jest.mock('../../../../main/modules/analytics/shared/outstandingSort', () => ({
  parseOutstandingSort: jest.fn(),
}));

jest.mock('../../../../main/modules/analytics/shared/partials', () => ({
  getAjaxPartialTemplate: jest.fn(),
  isAjaxRequest: jest.fn(),
}));

jest.mock('../../../../main/modules/analytics/outstanding/criticalTasksPagination', () => ({
  parseCriticalTasksPage: jest.fn(),
}));

jest.mock('../../../../main/modules/analytics/outstanding/page', () => ({
  buildOutstandingPage: jest.fn(),
}));

describe('outstandingController', () => {
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
    const req = { method: 'GET', query: { region: 'North' }, get: jest.fn() } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ region: ['North'] });
    (parseOutstandingSort as jest.Mock).mockReturnValue({ criticalTasks: { by: 'dueDate', dir: 'asc' } });
    (parseCriticalTasksPage as jest.Mock).mockReturnValue(1);
    (buildOutstandingPage as jest.Mock).mockResolvedValue({ view: 'outstanding' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    outstandingController.registerOutstandingRoutes(router);

    expect(router.get).toHaveBeenCalledWith('/outstanding', expect.any(Function));
    expect(router.post).toHaveBeenCalledWith('/outstanding', expect.any(Function));

    const handler = (router.get as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(applyFilterCookieFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        res,
        source: req.query,
      })
    );
    expect(parseOutstandingSort).toHaveBeenCalledWith(req.query);
    expect(buildOutstandingPage).toHaveBeenCalledWith(
      { region: ['North'] },
      {
        criticalTasks: { by: 'dueDate', dir: 'asc' },
      },
      1,
      undefined,
      undefined
    );
    expect(getAjaxPartialTemplate).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith('analytics/outstanding/index', { view: 'outstanding' });
  });

  test('handles POST requests with body payloads', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = { method: 'POST', body: { service: 'Crime' }, get: jest.fn() } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ service: ['Crime'] });
    (parseOutstandingSort as jest.Mock).mockReturnValue({ criticalTasks: { by: 'dueDate', dir: 'asc' } });
    (parseCriticalTasksPage as jest.Mock).mockReturnValue(3);
    (buildOutstandingPage as jest.Mock).mockResolvedValue({ view: 'outstanding-post' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    outstandingController.registerOutstandingRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(applyFilterCookieFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        res,
        source: req.body,
      })
    );
    expect(parseOutstandingSort).toHaveBeenCalledWith(req.body);
    expect(buildOutstandingPage).toHaveBeenCalledWith(
      { service: ['Crime'] },
      {
        criticalTasks: { by: 'dueDate', dir: 'asc' },
      },
      3,
      undefined,
      undefined
    );
    expect(getAjaxPartialTemplate).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith('analytics/outstanding/index', { view: 'outstanding-post' });
  });

  test('renders critical tasks partial for ajax sort requests', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = {
      method: 'POST',
      body: { service: 'Crime', ajaxSection: 'criticalTasks', snapshotToken: createSnapshotToken(55) },
      get: jest.fn().mockReturnValue('fetch'),
    } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ service: ['Crime'] });
    (parseOutstandingSort as jest.Mock).mockReturnValue({ criticalTasks: { by: 'dueDate', dir: 'asc' } });
    (parseCriticalTasksPage as jest.Mock).mockReturnValue(2);
    (buildOutstandingPage as jest.Mock).mockResolvedValue({ view: 'outstanding-ajax' });
    (isAjaxRequest as jest.Mock).mockReturnValue(true);
    (getAjaxPartialTemplate as jest.Mock).mockReturnValue('analytics/outstanding/partials/critical-tasks');

    outstandingController.registerOutstandingRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(buildOutstandingPage).toHaveBeenCalledWith(
      { service: ['Crime'] },
      {
        criticalTasks: { by: 'dueDate', dir: 'asc' },
      },
      2,
      'criticalTasks',
      undefined,
      55
    );
    expect(getAjaxPartialTemplate).toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith('analytics/outstanding/partials/critical-tasks', { view: 'outstanding-ajax' });
  });

  test('falls back to full page when ajax template is missing', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = {
      method: 'POST',
      body: { ajaxSection: 'criticalTasks' },
      get: jest.fn().mockReturnValue('fetch'),
    } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({});
    (parseOutstandingSort as jest.Mock).mockReturnValue({ criticalTasks: { by: 'dueDate', dir: 'asc' } });
    (parseCriticalTasksPage as jest.Mock).mockReturnValue(1);
    (buildOutstandingPage as jest.Mock).mockResolvedValue({ view: 'outstanding-fallback' });
    (isAjaxRequest as jest.Mock).mockReturnValue(true);
    (getAjaxPartialTemplate as jest.Mock).mockReturnValue(undefined);

    outstandingController.registerOutstandingRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(render).toHaveBeenCalledWith('analytics/outstanding/index', { view: 'outstanding-fallback' });
  });
});
