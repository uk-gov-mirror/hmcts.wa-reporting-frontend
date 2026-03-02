import { Request, Response, Router } from 'express';

import { BASE_FILTER_KEYS, applyFilterCookieFromConfig } from '../shared/filterCookies';
import { parseChangedFacetFilter } from '../shared/filters';
import { parseSnapshotTokenInput } from '../shared/pageUtils';
import { getAjaxPartialTemplate, isAjaxRequest } from '../shared/partials';
import { AnalyticsFilters } from '../shared/types';

import { buildOverviewPage } from './page';

class OverviewController {
  private readonly allowedFilterKeys: (keyof AnalyticsFilters)[] = [...BASE_FILTER_KEYS, 'eventsFrom', 'eventsTo'];
  private readonly partials = {
    'shared-filters': 'analytics/overview/overview-filters',
    'overview-task-events': 'analytics/overview/partials/task-events-table',
    'overview-service-performance': 'analytics/overview/partials/service-performance-table',
  };

  registerOverviewRoutes(router: Router): void {
    const handler = async (req: Request, res: Response) => {
      const source = (req.method === 'POST' ? req.body : req.query) as Record<string, unknown>;
      const filters = applyFilterCookieFromConfig({
        req,
        res,
        source,
        allowedKeys: this.allowedFilterKeys,
      });
      const ajaxSection = typeof source.ajaxSection === 'string' ? source.ajaxSection : undefined;
      const changedFilter = parseChangedFacetFilter(source.changedFilter, { includeUserFilter: false });
      const requestedSnapshotId = parseSnapshotTokenInput(source.snapshotToken);
      const viewModel =
        requestedSnapshotId !== undefined
          ? await buildOverviewPage(filters, ajaxSection, changedFilter, requestedSnapshotId)
          : await buildOverviewPage(filters, ajaxSection, changedFilter);
      if (isAjaxRequest(req)) {
        const template = getAjaxPartialTemplate({
          source,
          partials: this.partials,
        });
        if (template) {
          return res.render(template, viewModel);
        }
      }
      res.render('analytics/overview/index', viewModel);
    };

    router.get('/', handler);
    router.post('/', handler);
  }
}

export const overviewController = new OverviewController();
