import { emptyOverviewFilterOptions } from '../shared/filters';
import {
  fetchFacetedFilterStateWithFallback,
  fetchPublishedSnapshotContext,
  resolveDateRangeWithDefaults,
  settledValueWithError,
} from '../shared/pageUtils';
import { AnalyticsFilters } from '../shared/types';
import { logDbError } from '../shared/utils';

import { overviewService } from './service';
import { buildOverviewViewModel } from './viewModel';
import { serviceOverviewTableService } from './visuals/serviceOverviewTableService';
import { taskEventsByServiceChartService } from './visuals/taskEventsByServiceChartService';

type OverviewPageViewModel = ReturnType<typeof buildOverviewViewModel>;

const overviewSections = ['overview-service-performance', 'overview-task-events'] as const;

type OverviewAjaxSection = (typeof overviewSections)[number];

const deferredSections = new Set<OverviewAjaxSection>(overviewSections);

function resolveOverviewSection(raw?: string): OverviewAjaxSection | undefined {
  if (!raw) {
    return undefined;
  }
  return overviewSections.includes(raw as OverviewAjaxSection) ? (raw as OverviewAjaxSection) : undefined;
}

function shouldFetchSection(requested: OverviewAjaxSection | undefined, section: OverviewAjaxSection): boolean {
  if (!requested) {
    return !deferredSections.has(section);
  }
  return requested === section;
}

export async function buildOverviewPage(
  filters: AnalyticsFilters,
  ajaxSection?: string,
  changedFilter?: 'service' | 'roleCategory' | 'region' | 'location' | 'workType' | 'taskName' | 'user',
  requestedSnapshotId?: number
): Promise<OverviewPageViewModel> {
  const snapshotContext = await fetchPublishedSnapshotContext(requestedSnapshotId);
  const requestedSection = resolveOverviewSection(ajaxSection);
  const shouldFetchOverview = shouldFetchSection(requestedSection, 'overview-service-performance');
  const shouldFetchTaskEvents = shouldFetchSection(requestedSection, 'overview-task-events');
  let overview = overviewService.buildOverview([]);
  if (shouldFetchOverview) {
    try {
      const dbOverview = await serviceOverviewTableService.fetchServiceOverview(snapshotContext.snapshotId, filters);
      if (dbOverview.serviceRows.length > 0) {
        overview = dbOverview;
      }
    } catch (error) {
      logDbError('Failed to fetch service overview from database', error);
    }
  }

  const eventsRange = resolveDateRangeWithDefaults({ from: filters.eventsFrom, to: filters.eventsTo, daysBack: 30 });
  let taskEventsRows: {
    service: string;
    completed: number;
    cancelled: number;
    created: number;
  }[] = [];
  let taskEventsTotals = { service: 'Total', completed: 0, cancelled: 0, created: 0 };

  const allTasks: { service: string; roleCategory: string; region: string; location: string; taskName: string }[] = [];
  const [eventsResult, facetedFiltersResult] = await Promise.allSettled([
    shouldFetchTaskEvents
      ? taskEventsByServiceChartService.fetchTaskEventsByService(snapshotContext.snapshotId, filters, eventsRange)
      : Promise.resolve(null),
    requestedSection
      ? Promise.resolve<{ filters: AnalyticsFilters; filterOptions: ReturnType<typeof emptyOverviewFilterOptions> }>({
          filters,
          filterOptions: emptyOverviewFilterOptions(),
        })
      : fetchFacetedFilterStateWithFallback({
          errorMessage: 'Failed to fetch overview filter options from database',
          snapshotId: snapshotContext.snapshotId,
          filters,
          changedFilter,
          includeUserFilter: false,
        }),
  ]);

  const eventsValue = settledValueWithError(eventsResult, 'Failed to fetch task events by service from database');
  if (eventsValue) {
    taskEventsRows = eventsValue.rows;
    taskEventsTotals = eventsValue.totals;
  }

  const facetedFilterState =
    facetedFiltersResult.status === 'fulfilled'
      ? facetedFiltersResult.value
      : { filters, filterOptions: emptyOverviewFilterOptions() };
  const resolvedFilters = facetedFilterState.filters;
  const filterOptions = facetedFilterState.filterOptions;

  return buildOverviewViewModel({
    filters: resolvedFilters,
    snapshotId: snapshotContext.snapshotId,
    snapshotToken: snapshotContext.snapshotToken,
    overview,
    filterOptions,
    allTasks,
    taskEventsRows,
    taskEventsTotals,
    eventsRange,
    freshnessInsetText: snapshotContext.freshnessInsetText,
  });
}
