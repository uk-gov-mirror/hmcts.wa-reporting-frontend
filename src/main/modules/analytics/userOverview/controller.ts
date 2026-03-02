import { Request, Response, Router } from 'express';

import { BASE_FILTER_KEYS, applyFilterCookieFromConfig } from '../shared/filterCookies';
import { parseChangedFacetFilter } from '../shared/filters';
import { parseSnapshotTokenInput } from '../shared/pageUtils';
import { getAjaxPartialTemplate, isAjaxRequest } from '../shared/partials';
import { AnalyticsFilters } from '../shared/types';
import { parseUserOverviewSort } from '../shared/userOverviewSort';

import { buildUserOverviewPage } from './page';
import { parseAssignedPage, parseCompletedPage } from './pagination';

class UserOverviewController {
  private readonly allowedFilterKeys: (keyof AnalyticsFilters)[] = [
    ...BASE_FILTER_KEYS,
    'user',
    'completedFrom',
    'completedTo',
  ];
  private readonly partials = {
    'shared-filters': 'analytics/user-overview/user-overview-filters',
    assigned: 'analytics/user-overview/partials/assigned-tasks',
    completed: 'analytics/user-overview/partials/completed-tasks',
    'user-overview-assigned': 'analytics/user-overview/partials/assigned-tasks',
    'user-overview-completed': 'analytics/user-overview/partials/completed-tasks',
    'user-overview-completed-by-date': 'analytics/user-overview/partials/completed-by-date',
    'user-overview-completed-by-task-name': 'analytics/user-overview/partials/completed-by-task-name',
  };

  registerUserOverviewRoutes(router: Router): void {
    const handler = async (req: Request, res: Response) => {
      const source = (req.method === 'POST' ? req.body : req.query) as Record<string, unknown>;
      const filters = applyFilterCookieFromConfig({
        req,
        res,
        source,
        allowedKeys: this.allowedFilterKeys,
      });
      const sort = parseUserOverviewSort(source);

      const assignedPage = parseAssignedPage(source.assignedPage);
      const completedPage = parseCompletedPage(source.completedPage);
      const ajaxSection = typeof source.ajaxSection === 'string' ? source.ajaxSection : undefined;
      const changedFilter = parseChangedFacetFilter(source.changedFilter, { includeUserFilter: true });
      const requestedSnapshotId = parseSnapshotTokenInput(source.snapshotToken);
      const viewModel =
        requestedSnapshotId !== undefined
          ? await buildUserOverviewPage(
              filters,
              sort,
              assignedPage,
              completedPage,
              ajaxSection,
              changedFilter,
              requestedSnapshotId
            )
          : await buildUserOverviewPage(filters, sort, assignedPage, completedPage, ajaxSection, changedFilter);
      if (isAjaxRequest(req)) {
        const template = getAjaxPartialTemplate({
          source,
          partials: this.partials,
        });
        if (template) {
          return res.render(template, viewModel);
        }
      }
      res.render('analytics/user-overview/index', viewModel);
    };

    router.get('/users', handler);
    router.post('/users', handler);
  }
}

export const userOverviewController = new UserOverviewController();
