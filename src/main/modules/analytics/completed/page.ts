import { emptyOverviewFilterOptions } from '../shared/filters';
import type { FacetFilterKey } from '../shared/filters';
import {
  fetchFacetedFilterStateWithFallback,
  fetchPublishedSnapshotContext,
  normaliseDateRange,
  settledArrayWithFallback,
  settledValueWithError,
  settledValueWithFallback,
} from '../shared/pageUtils';
import { CompletedTaskAuditRow, taskThinRepository } from '../shared/repositories';
import { caseWorkerProfileService, courtVenueService, regionService } from '../shared/services';
import { AnalyticsFilters, CompletedMetric, CompletedResponse, Task } from '../shared/types';
import { formatAnalyticsDateDisplay } from '../shared/formatting';
import { lookup } from '../shared/utils';

import { completedService } from './service';
import { TaskAuditEntry, buildCompletedViewModel } from './viewModel';
import { completedByNameChartService } from './visuals/completedByNameChartService';
import { completedComplianceSummaryService } from './visuals/completedComplianceSummaryService';
import { completedProcessingHandlingTimeService } from './visuals/completedProcessingHandlingTimeService';
import { completedRegionLocationTableService } from './visuals/completedRegionLocationTableService';
import { completedTimelineChartService } from './visuals/completedTimelineChartService';

type CompletedPageViewModel = ReturnType<typeof buildCompletedViewModel>;

const completedSections = [
  'completed-summary',
  'completed-timeline',
  'completed-by-name',
  'completed-task-audit',
  'completed-by-region-location',
  'completed-processing-handling-time',
] as const;

type CompletedAjaxSection = (typeof completedSections)[number];

const deferredSections = new Set<CompletedAjaxSection>(completedSections);

function resolveCompletedSection(raw?: string): CompletedAjaxSection | undefined {
  if (!raw) {
    return undefined;
  }
  return completedSections.includes(raw as CompletedAjaxSection) ? (raw as CompletedAjaxSection) : undefined;
}

function shouldFetchSection(requested: CompletedAjaxSection | undefined, section: CompletedAjaxSection): boolean {
  if (!requested) {
    return !deferredSections.has(section);
  }
  return requested === section;
}

function mapTaskAuditRow(
  row: CompletedTaskAuditRow,
  caseWorkerNames: Record<string, string>,
  locationDescriptions: Record<string, string>
): TaskAuditEntry {
  const assigneeId = row.assignee ?? undefined;
  const agentName = assigneeId ? (caseWorkerNames[assigneeId] ?? assigneeId) : null;
  return {
    caseId: row.case_id,
    taskName: row.task_name,
    agentName,
    completedDate: formatAnalyticsDateDisplay(row.completed_date),
    completedDateRaw: row.completed_date ?? '-',
    totalAssignments: (row.number_of_reassignments ?? 0) + 1,
    location: row.location ? lookup(row.location, locationDescriptions) : null,
    status: row.termination_process_label,
    outcome: row.outcome,
  };
}

export async function buildCompletedPage(
  filters: AnalyticsFilters,
  selectedMetric: CompletedMetric,
  caseId?: string,
  ajaxSection?: string,
  changedFilter?: FacetFilterKey,
  requestedSnapshotId?: number
): Promise<CompletedPageViewModel> {
  const snapshotContext = await fetchPublishedSnapshotContext(requestedSnapshotId);
  const requestedSection = resolveCompletedSection(ajaxSection);
  const shouldFetchSummary = shouldFetchSection(requestedSection, 'completed-summary');
  const shouldFetchTimeline = shouldFetchSection(requestedSection, 'completed-timeline');
  const shouldFetchCompletedByName = shouldFetchSection(requestedSection, 'completed-by-name');
  const shouldFetchTaskAudit = shouldFetchSection(requestedSection, 'completed-task-audit');
  const shouldFetchRegionLocation = shouldFetchSection(requestedSection, 'completed-by-region-location');
  const shouldFetchProcessingHandling = shouldFetchSection(requestedSection, 'completed-processing-handling-time');
  const shouldFetchTaskAuditData = shouldFetchTaskAudit && Boolean(caseId);
  const shouldFetchLocationDescriptions = shouldFetchRegionLocation || shouldFetchTaskAuditData;

  const fallback = completedService.buildCompleted([]);
  const fallbackRegionLocation = completedService.buildCompletedByRegionLocation([]);

  let summary = fallback.summary;
  let timeline = fallback.timeline;
  let completedByName = fallback.completedByName;
  let completedByLocation = fallbackRegionLocation.byLocation;
  let completedByRegion = fallbackRegionLocation.byRegion;
  const range = normaliseDateRange({ from: filters.completedFrom, to: filters.completedTo });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    rangeSummaryResult,
    todaySummaryResult,
    timelineResult,
    processingHandlingResult,
    completedByNameResult,
    completedByLocationResult,
    completedByRegionResult,
    taskAuditRowsResult,
    caseWorkerNamesResult,
    regionDescriptionsResult,
    locationDescriptionsResult,
  ] = await Promise.allSettled([
    shouldFetchSummary
      ? completedComplianceSummaryService.fetchCompletedSummary(snapshotContext.snapshotId, filters, range)
      : Promise.resolve(null),
    shouldFetchSummary
      ? completedComplianceSummaryService.fetchCompletedSummary(snapshotContext.snapshotId, filters, {
          from: today,
          to: today,
        })
      : Promise.resolve(null),
    shouldFetchTimeline
      ? completedTimelineChartService.fetchCompletedTimeline(snapshotContext.snapshotId, filters, range)
      : Promise.resolve([]),
    shouldFetchProcessingHandling
      ? completedProcessingHandlingTimeService.fetchCompletedProcessingHandlingTime(
          snapshotContext.snapshotId,
          filters,
          range
        )
      : Promise.resolve([]),
    shouldFetchCompletedByName
      ? completedByNameChartService.fetchCompletedByName(snapshotContext.snapshotId, filters, range)
      : Promise.resolve([]),
    shouldFetchRegionLocation
      ? completedRegionLocationTableService.fetchCompletedByLocation(snapshotContext.snapshotId, filters, range)
      : Promise.resolve([]),
    shouldFetchRegionLocation
      ? completedRegionLocationTableService.fetchCompletedByRegion(snapshotContext.snapshotId, filters, range)
      : Promise.resolve([]),
    shouldFetchTaskAuditData
      ? taskThinRepository.fetchCompletedTaskAuditRows(snapshotContext.snapshotId, filters, caseId!)
      : Promise.resolve([]),
    shouldFetchTaskAuditData ? caseWorkerProfileService.fetchCaseWorkerProfileNames() : Promise.resolve({}),
    shouldFetchRegionLocation ? regionService.fetchRegionDescriptions() : Promise.resolve({}),
    shouldFetchLocationDescriptions ? courtVenueService.fetchCourtVenueDescriptions() : Promise.resolve({}),
  ]);

  const rangeSummary = settledValueWithError(rangeSummaryResult, 'Failed to fetch completed summary from database');
  if (rangeSummary) {
    summary = {
      ...summary,
      completedInRange: rangeSummary.total,
      withinDueYes: rangeSummary.within,
      withinDueNo: rangeSummary.total - rangeSummary.within,
    };
  }

  const todaySummary = settledValueWithError(
    todaySummaryResult,
    'Failed to fetch completed today summary from database'
  );
  if (todaySummary) {
    summary = {
      ...summary,
      completedToday: todaySummary.total,
      withinDueTodayYes: todaySummary.within,
      withinDueTodayNo: todaySummary.total - todaySummary.within,
    };
  }

  timeline = settledArrayWithFallback(timelineResult, 'Failed to fetch completed timeline from database', timeline);
  const processingHandlingTime = settledArrayWithFallback(
    processingHandlingResult,
    'Failed to fetch processing/handling time stats from database',
    fallback.processingHandlingTime
  );
  completedByName = settledArrayWithFallback(
    completedByNameResult,
    'Failed to fetch completed by name from database',
    completedByName
  );
  completedByLocation = settledArrayWithFallback(
    completedByLocationResult,
    'Failed to fetch completed by location from database',
    completedByLocation
  );
  completedByRegion = settledArrayWithFallback(
    completedByRegionResult,
    'Failed to fetch completed by region from database',
    completedByRegion
  );
  const taskAuditRows = settledArrayWithFallback(
    taskAuditRowsResult,
    'Failed to fetch completed task audit rows from database',
    []
  );
  const caseWorkerNames = settledValueWithFallback(
    caseWorkerNamesResult,
    'Failed to fetch case worker profiles from database',
    {}
  );
  const regionDescriptions = settledValueWithFallback(
    regionDescriptionsResult,
    'Failed to fetch region descriptions from database',
    {}
  );
  const locationDescriptions = settledValueWithFallback(
    locationDescriptionsResult,
    'Failed to fetch court venue descriptions from database',
    {}
  );
  const facetedFilterState = requestedSection
    ? { filters, filterOptions: emptyOverviewFilterOptions() }
    : await fetchFacetedFilterStateWithFallback({
        errorMessage: 'Failed to fetch completed filter options from database',
        snapshotId: snapshotContext.snapshotId,
        filters,
        changedFilter,
        includeUserFilter: false,
      });
  const resolvedFilters = facetedFilterState.filters;
  const filterOptions = facetedFilterState.filterOptions;
  const allTasks: Task[] = [];

  const completed: CompletedResponse = {
    ...fallback,
    summary,
    timeline,
    completedByName,
    processingHandlingTime,
  };

  return buildCompletedViewModel({
    filters: resolvedFilters,
    snapshotId: snapshotContext.snapshotId,
    snapshotToken: snapshotContext.snapshotToken,
    completed,
    allTasks,
    filterOptions,
    completedByLocation,
    completedByRegion,
    regionDescriptions,
    locationDescriptions,
    taskAuditRows: taskAuditRows.map(row => mapTaskAuditRow(row, caseWorkerNames, locationDescriptions)),
    taskAuditCaseId: caseId ?? '',
    selectedMetric,
    freshnessInsetText: snapshotContext.freshnessInsetText,
  });
}
