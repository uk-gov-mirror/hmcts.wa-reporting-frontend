import { Request, Response, Router } from 'express';

import { BASE_FILTER_KEYS, applyFilterCookieFromConfig } from '../shared/filterCookies';
import { parseChangedFacetFilter } from '../shared/filters';
import { parseOutstandingSort } from '../shared/outstandingSort';
import { parseSnapshotTokenInput } from '../shared/pageUtils';
import { getAjaxPartialTemplate, isAjaxRequest } from '../shared/partials';
import { AnalyticsFilters } from '../shared/types';

import { parseCriticalTasksPage } from './criticalTasksPagination';
import { buildOutstandingPage } from './page';

class OutstandingController {
  private readonly allowedFilterKeys: (keyof AnalyticsFilters)[] = [...BASE_FILTER_KEYS];
  private readonly partials = {
    'shared-filters': 'analytics/outstanding/outstanding-filters',
    criticalTasks: 'analytics/outstanding/partials/critical-tasks',
    'open-tasks-summary': 'analytics/outstanding/partials/open-tasks-summary',
    'open-tasks-table': 'analytics/outstanding/partials/open-tasks-table',
    'wait-time-table': 'analytics/outstanding/partials/wait-time-table',
    'tasks-due': 'analytics/outstanding/partials/tasks-due',
    'open-tasks-priority': 'analytics/outstanding/partials/open-tasks-priority',
    'open-by-name': 'analytics/outstanding/partials/open-by-name',
    'open-by-region-location': 'analytics/outstanding/partials/open-by-region-location',
  };

  registerOutstandingRoutes(router: Router): void {
    const handler = async (req: Request, res: Response) => {
      const source = (req.method === 'POST' ? req.body : req.query) as Record<string, unknown>;
      const filters = applyFilterCookieFromConfig({
        req,
        res,
        source,
        allowedKeys: this.allowedFilterKeys,
      });
      const sort = parseOutstandingSort(source);
      const criticalTasksPage = parseCriticalTasksPage(source.criticalTasksPage);
      const ajaxSection = typeof source.ajaxSection === 'string' ? source.ajaxSection : undefined;
      const changedFilter = parseChangedFacetFilter(source.changedFilter, { includeUserFilter: false });
      const requestedSnapshotId = parseSnapshotTokenInput(source.snapshotToken);
      const viewModel =
        requestedSnapshotId !== undefined
          ? await buildOutstandingPage(
              filters,
              sort,
              criticalTasksPage,
              ajaxSection,
              changedFilter,
              requestedSnapshotId
            )
          : await buildOutstandingPage(filters, sort, criticalTasksPage, ajaxSection, changedFilter);
      if (isAjaxRequest(req)) {
        const template = getAjaxPartialTemplate({
          source,
          partials: this.partials,
        });
        if (template) {
          return res.render(template, viewModel);
        }
      }
      res.render('analytics/outstanding/index', viewModel);
    };

    router.get('/outstanding', handler);
    router.post('/outstanding', handler);
  }
}

export const outstandingController = new OutstandingController();
