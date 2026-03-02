import { Request, Response, Router } from 'express';

import { BASE_FILTER_KEYS, applyFilterCookieFromConfig } from '../shared/filterCookies';
import { parseChangedFacetFilter } from '../shared/filters';
import { parseSnapshotTokenInput } from '../shared/pageUtils';
import { getAjaxPartialTemplate, isAjaxRequest } from '../shared/partials';
import { AnalyticsFilters, CompletedMetric } from '../shared/types';

import { buildCompletedPage } from './page';

function parseCaseId(source: Record<string, unknown>): string | undefined {
  if (typeof source.caseId !== 'string') {
    return undefined;
  }
  const trimmed = source.caseId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseMetric(source: Record<string, unknown>): CompletedMetric {
  if (source.metric === 'processingTime') {
    return 'processingTime';
  }
  return 'handlingTime';
}

class CompletedController {
  private readonly allowedFilterKeys: (keyof AnalyticsFilters)[] = [
    ...BASE_FILTER_KEYS,
    'completedFrom',
    'completedTo',
  ];
  private readonly partials = {
    'shared-filters': 'analytics/completed/completed-filters',
    'completed-summary': 'analytics/completed/partials/completed-summary',
    'completed-timeline': 'analytics/completed/partials/completed-timeline',
    'completed-by-name': 'analytics/completed/partials/completed-by-name',
    'completed-task-audit': 'analytics/completed/partials/task-audit',
    'completed-by-region-location': 'analytics/completed/partials/completed-by-region-location',
    'completed-processing-handling-time': 'analytics/completed/partials/processing-handling-time',
  };

  registerCompletedRoutes(router: Router): void {
    const handler = async (req: Request, res: Response) => {
      const source = (req.method === 'POST' ? req.body : req.query) as Record<string, unknown>;
      const filters = applyFilterCookieFromConfig({
        req,
        res,
        source,
        allowedKeys: this.allowedFilterKeys,
      });
      const caseId = parseCaseId(source);
      const metric = parseMetric(source);
      const ajaxSection = typeof source.ajaxSection === 'string' ? source.ajaxSection : undefined;
      const changedFilter = parseChangedFacetFilter(source.changedFilter, { includeUserFilter: false });
      const requestedSnapshotId = parseSnapshotTokenInput(source.snapshotToken);
      const viewModel =
        requestedSnapshotId !== undefined
          ? await buildCompletedPage(filters, metric, caseId, ajaxSection, changedFilter, requestedSnapshotId)
          : await buildCompletedPage(filters, metric, caseId, ajaxSection, changedFilter);

      if (isAjaxRequest(req)) {
        const template = getAjaxPartialTemplate({
          source,
          partials: this.partials,
        });
        if (template) {
          return res.render(template, viewModel);
        }
      }
      res.render('analytics/completed/index', viewModel);
    };

    router.get('/completed', handler);
    router.post('/completed', handler);
  }
}

export const completedController = new CompletedController();
