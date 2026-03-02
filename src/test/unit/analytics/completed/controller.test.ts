import { Request, Response, Router } from 'express';

import { completedController } from '../../../../main/modules/analytics/completed/controller';
import { buildCompletedPage } from '../../../../main/modules/analytics/completed/page';
import { applyFilterCookieFromConfig } from '../../../../main/modules/analytics/shared/filterCookies';
import { createSnapshotToken } from '../../../../main/modules/analytics/shared/pageUtils';
import { getAjaxPartialTemplate, isAjaxRequest } from '../../../../main/modules/analytics/shared/partials';

jest.mock('../../../../main/modules/analytics/shared/filterCookies', () => ({
  applyFilterCookieFromConfig: jest.fn(),
  BASE_FILTER_KEYS: ['service', 'roleCategory', 'region', 'location', 'taskName', 'workType'],
}));

jest.mock('../../../../main/modules/analytics/completed/page', () => ({
  buildCompletedPage: jest.fn(),
}));

jest.mock('../../../../main/modules/analytics/shared/partials', () => ({
  getAjaxPartialTemplate: jest.fn(),
  isAjaxRequest: jest.fn(),
}));

describe('completedController', () => {
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
    const req = { method: 'GET', query: { service: 'Civil' } } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ service: ['Civil'] });
    (buildCompletedPage as jest.Mock).mockResolvedValue({ view: 'completed' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    completedController.registerCompletedRoutes(router);

    expect(router.get).toHaveBeenCalledWith('/completed', expect.any(Function));
    expect(router.post).toHaveBeenCalledWith('/completed', expect.any(Function));

    const handler = (router.get as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(applyFilterCookieFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        res,
        source: req.query,
      })
    );
    expect(buildCompletedPage).toHaveBeenCalledWith(
      { service: ['Civil'] },
      'handlingTime',
      undefined,
      undefined,
      undefined
    );
    expect(render).toHaveBeenCalledWith('analytics/completed/index', { view: 'completed' });
  });

  test('handles POST requests with body payloads', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = { method: 'POST', body: { taskName: 'Review' } } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ taskName: ['Review'] });
    (buildCompletedPage as jest.Mock).mockResolvedValue({ view: 'completed-post' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    completedController.registerCompletedRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(applyFilterCookieFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        res,
        source: req.body,
      })
    );
    expect(buildCompletedPage).toHaveBeenCalledWith(
      { taskName: ['Review'] },
      'handlingTime',
      undefined,
      undefined,
      undefined
    );
    expect(render).toHaveBeenCalledWith('analytics/completed/index', { view: 'completed-post' });
  });

  test('passes trimmed case ID to page builder', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = {
      method: 'POST',
      body: { caseId: ' 1234567890 ' },
    } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({});
    (buildCompletedPage as jest.Mock).mockResolvedValue({ view: 'completed-case-id' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    completedController.registerCompletedRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(buildCompletedPage).toHaveBeenCalledWith({}, 'handlingTime', '1234567890', undefined, undefined);
    expect(render).toHaveBeenCalledWith('analytics/completed/index', { view: 'completed-case-id' });
  });

  test('uses processing time metric when provided', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = { method: 'GET', query: { metric: 'processingTime' } } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({});
    (buildCompletedPage as jest.Mock).mockResolvedValue({ view: 'completed-metric' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    completedController.registerCompletedRoutes(router);

    const handler = (router.get as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(buildCompletedPage).toHaveBeenCalledWith({}, 'processingTime', undefined, undefined, undefined);
    expect(render).toHaveBeenCalledWith('analytics/completed/index', { view: 'completed-metric' });
  });

  test('ignores blank case IDs', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = {
      method: 'POST',
      body: { caseId: '   ' },
    } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({});
    (buildCompletedPage as jest.Mock).mockResolvedValue({ view: 'completed-blank' });
    (isAjaxRequest as jest.Mock).mockReturnValue(false);

    completedController.registerCompletedRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(buildCompletedPage).toHaveBeenCalledWith({}, 'handlingTime', undefined, undefined, undefined);
    expect(render).toHaveBeenCalledWith('analytics/completed/index', { view: 'completed-blank' });
  });

  test('renders task audit partial for ajax requests', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = {
      method: 'POST',
      body: { ajaxSection: 'completed-task-audit', caseId: '174', snapshotToken: createSnapshotToken(66) },
      get: jest.fn().mockReturnValue('fetch'),
    } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({ service: ['Crime'] });
    (buildCompletedPage as jest.Mock).mockResolvedValue({ view: 'completed-ajax' });
    (isAjaxRequest as jest.Mock).mockReturnValue(true);
    (getAjaxPartialTemplate as jest.Mock).mockReturnValue('analytics/completed/partials/task-audit');

    completedController.registerCompletedRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(getAjaxPartialTemplate).toHaveBeenCalled();
    expect(buildCompletedPage).toHaveBeenCalledWith(
      { service: ['Crime'] },
      'handlingTime',
      '174',
      'completed-task-audit',
      undefined,
      66
    );
    expect(render).toHaveBeenCalledWith('analytics/completed/partials/task-audit', { view: 'completed-ajax' });
  });

  test('falls back to full page when ajax template is missing', async () => {
    const router = buildRouter();
    const render = jest.fn();
    const req = {
      method: 'POST',
      body: { ajaxSection: 'completed-task-audit' },
      get: jest.fn().mockReturnValue('fetch'),
    } as unknown as Request;
    const res = { render } as unknown as Response;

    (applyFilterCookieFromConfig as jest.Mock).mockReturnValue({});
    (buildCompletedPage as jest.Mock).mockResolvedValue({ view: 'completed-fallback' });
    (isAjaxRequest as jest.Mock).mockReturnValue(true);
    (getAjaxPartialTemplate as jest.Mock).mockReturnValue(undefined);

    completedController.registerCompletedRoutes(router);

    const handler = (router.post as jest.Mock).mock.calls[0][1];
    await handler(req, res);

    expect(buildCompletedPage).toHaveBeenCalledWith({}, 'handlingTime', undefined, 'completed-task-audit', undefined);
    expect(render).toHaveBeenCalledWith('analytics/completed/index', { view: 'completed-fallback' });
  });
});
