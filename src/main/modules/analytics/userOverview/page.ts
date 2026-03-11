import { completedComplianceSummaryService } from '../completed/visuals/completedComplianceSummaryService';
import { emptyOverviewFilterOptions } from '../shared/filters';
import type { FacetFilterKey } from '../shared/filters';
import {
  fetchFacetedFilterStateWithFallback,
  fetchPublishedSnapshotContext,
  normaliseDateRange,
  settledArrayWithFallback,
  settledValueWithFallback,
} from '../shared/pageUtils';
import { getCappedTotalPages, normalisePage } from '../shared/pagination';
import { priorityLabelFromRank } from '../shared/priority/priorityRankSql';
import type { AnalyticsQueryOptions } from '../shared/repositories';
import { UserOverviewTaskRow, taskFactsRepository, taskThinRepository } from '../shared/repositories';
import { caseWorkerProfileService, courtVenueService } from '../shared/services';
import { AnalyticsFilters, Task, TaskStatus } from '../shared/types';
import { UserOverviewSort } from '../shared/userOverviewSort';

import { USER_OVERVIEW_PAGE_SIZE } from './pagination';
import { CompletedByDatePoint, userOverviewService } from './service';
import { CompletedByTaskNameAggregate } from './types';
import { buildUserOverviewViewModel } from './viewModel';

type UserOverviewPageViewModel = ReturnType<typeof buildUserOverviewViewModel>;

const userOverviewSections = [
  'user-overview-assigned',
  'user-overview-completed',
  'user-overview-completed-by-date',
  'user-overview-completed-by-task-name',
  'assigned',
  'completed',
] as const;

type UserOverviewAjaxSection = (typeof userOverviewSections)[number];

const deferredSections = new Set<UserOverviewAjaxSection>([
  'user-overview-assigned',
  'user-overview-completed',
  'user-overview-completed-by-date',
  'user-overview-completed-by-task-name',
]);

const USER_OVERVIEW_QUERY_OPTIONS: AnalyticsQueryOptions = {
  excludeRoleCategories: ['Judicial'],
};

function resolveUserOverviewSection(raw?: string): UserOverviewAjaxSection | undefined {
  if (!raw) {
    return undefined;
  }
  return userOverviewSections.includes(raw as UserOverviewAjaxSection) ? (raw as UserOverviewAjaxSection) : undefined;
}

function shouldFetchSection(requested: UserOverviewAjaxSection | undefined, section: UserOverviewAjaxSection): boolean {
  if (!requested) {
    return !deferredSections.has(section);
  }
  if (requested === 'assigned') {
    return section === 'user-overview-assigned';
  }
  if (requested === 'completed') {
    return section === 'user-overview-completed';
  }
  return requested === section;
}

function mapUserOverviewRow(row: UserOverviewTaskRow, caseWorkerNames: Record<string, string>): Task {
  const totalAssignments = (row.number_of_reassignments ?? 0) + 1;
  const withinSla = row.is_within_sla === 'Yes' ? true : row.is_within_sla === 'No' ? false : null;
  const assigneeId = row.assignee ?? undefined;
  const assigneeName = assigneeId ? (caseWorkerNames[assigneeId] ?? assigneeId) : undefined;
  return {
    caseId: row.case_id,
    taskId: row.task_id,
    service: row.jurisdiction_label ?? '',
    roleCategory: row.role_category_label ?? '',
    region: row.region ?? '',
    location: row.location ?? '',
    taskName: row.task_name ?? '',
    priority: priorityLabelFromRank(row.priority_rank),
    createdDate: row.created_date ?? '-',
    assignedDate: row.first_assigned_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    completedDate: row.completed_date ?? undefined,
    handlingTimeDays: row.handling_time_days ?? undefined,
    withinSla,
    assigneeId,
    assigneeName,
    totalAssignments,
  };
}

export async function buildUserOverviewPage(
  filters: AnalyticsFilters,
  sort: UserOverviewSort,
  assignedPage = 1,
  completedPage = 1,
  ajaxSection?: string,
  changedFilter?: FacetFilterKey,
  requestedSnapshotId?: number
): Promise<UserOverviewPageViewModel> {
  const snapshotContext = await fetchPublishedSnapshotContext(requestedSnapshotId);
  const requestedSection = resolveUserOverviewSection(ajaxSection);
  const shouldFetchAssigned = shouldFetchSection(requestedSection, 'user-overview-assigned');
  const shouldFetchCompleted = shouldFetchSection(requestedSection, 'user-overview-completed');
  const shouldFetchCompletedByDate = shouldFetchSection(requestedSection, 'user-overview-completed-by-date');
  const shouldFetchCompletedByTaskName = shouldFetchSection(requestedSection, 'user-overview-completed-by-task-name');
  const range = normaliseDateRange({ from: filters.completedFrom, to: filters.completedTo });
  const [assignedCountResult, completedCountResult] = await Promise.allSettled([
    shouldFetchAssigned
      ? taskThinRepository.fetchUserOverviewAssignedTaskCount(
          snapshotContext.snapshotId,
          filters,
          USER_OVERVIEW_QUERY_OPTIONS
        )
      : Promise.resolve(0),
    shouldFetchCompleted
      ? taskFactsRepository.fetchUserOverviewCompletedTaskCount(
          snapshotContext.snapshotId,
          filters,
          USER_OVERVIEW_QUERY_OPTIONS
        )
      : Promise.resolve(0),
  ]);
  const assignedTotalResults = settledValueWithFallback(
    assignedCountResult,
    'Failed to fetch user overview assigned tasks count from database',
    0
  );
  const completedTotalResults = settledValueWithFallback(
    completedCountResult,
    'Failed to fetch user overview completed tasks count from database',
    0
  );
  const assignedTotalPages = getCappedTotalPages(assignedTotalResults, USER_OVERVIEW_PAGE_SIZE);
  const completedTotalPages = getCappedTotalPages(completedTotalResults, USER_OVERVIEW_PAGE_SIZE);
  const resolvedAssignedPage = normalisePage(assignedPage, assignedTotalPages);
  const resolvedCompletedPage = normalisePage(completedPage, completedTotalPages);
  const [
    assignedResult,
    completedResult,
    assignedAllResult,
    completedByDateResult,
    completedByTaskNameResult,
    completedComplianceResult,
    locationDescriptionsResult,
    caseWorkerNamesResult,
  ] = await Promise.allSettled([
    shouldFetchAssigned
      ? taskThinRepository.fetchUserOverviewAssignedTaskRows(
          snapshotContext.snapshotId,
          filters,
          sort.assigned,
          {
            page: resolvedAssignedPage,
            pageSize: USER_OVERVIEW_PAGE_SIZE,
          },
          USER_OVERVIEW_QUERY_OPTIONS
        )
      : Promise.resolve([]),
    shouldFetchCompleted
      ? taskThinRepository.fetchUserOverviewCompletedTaskRows(
          snapshotContext.snapshotId,
          filters,
          sort.completed,
          {
            page: resolvedCompletedPage,
            pageSize: USER_OVERVIEW_PAGE_SIZE,
          },
          USER_OVERVIEW_QUERY_OPTIONS
        )
      : Promise.resolve([]),
    shouldFetchAssigned
      ? taskThinRepository.fetchUserOverviewAssignedTaskRows(
          snapshotContext.snapshotId,
          filters,
          sort.assigned,
          null,
          USER_OVERVIEW_QUERY_OPTIONS
        )
      : Promise.resolve([]),
    shouldFetchCompletedByDate
      ? taskThinRepository.fetchUserOverviewCompletedByDateRows(
          snapshotContext.snapshotId,
          filters,
          USER_OVERVIEW_QUERY_OPTIONS
        )
      : Promise.resolve([]),
    shouldFetchCompletedByTaskName
      ? taskThinRepository.fetchUserOverviewCompletedByTaskNameRows(
          snapshotContext.snapshotId,
          filters,
          USER_OVERVIEW_QUERY_OPTIONS
        )
      : Promise.resolve([]),
    shouldFetchCompleted
      ? completedComplianceSummaryService.fetchCompletedSummary(
          snapshotContext.snapshotId,
          filters,
          range,
          USER_OVERVIEW_QUERY_OPTIONS
        )
      : Promise.resolve(null),
    shouldFetchAssigned || shouldFetchCompleted ? courtVenueService.fetchCourtVenueDescriptions() : Promise.resolve({}),
    shouldFetchAssigned || shouldFetchCompleted
      ? caseWorkerProfileService.fetchCaseWorkerProfileNames()
      : Promise.resolve({}),
  ]);
  const assignedRows = settledArrayWithFallback(
    assignedResult,
    'Failed to fetch user overview assigned tasks from database',
    []
  );
  const completedRows = settledArrayWithFallback(
    completedResult,
    'Failed to fetch user overview completed tasks from database',
    []
  );
  const assignedAllRows = settledArrayWithFallback(
    assignedAllResult,
    'Failed to fetch user overview assigned tasks for charts from database',
    assignedRows
  );
  const completedByDateRows = settledArrayWithFallback(
    completedByDateResult,
    'Failed to fetch user overview completed by date rows from database',
    []
  );
  const completedByTaskNameRows = settledArrayWithFallback(
    completedByTaskNameResult,
    'Failed to fetch user overview completed by task name rows from database',
    []
  );
  const completedCompliance = settledValueWithFallback(
    completedComplianceResult,
    'Failed to fetch completed compliance summary from database',
    null
  );
  const locationDescriptions = settledValueWithFallback(
    locationDescriptionsResult,
    'Failed to fetch court venue descriptions from database',
    {}
  );
  const caseWorkerNames = settledValueWithFallback(
    caseWorkerNamesResult,
    'Failed to fetch case worker profiles from database',
    {}
  );
  const assignedTasks = assignedRows.map(row => ({
    ...mapUserOverviewRow(row, caseWorkerNames),
    status: 'assigned' as TaskStatus,
  }));
  const completedTasks = completedRows.map(row => ({
    ...mapUserOverviewRow(row, caseWorkerNames),
    status: 'completed' as TaskStatus,
  }));
  const assignedTasksAll = assignedAllRows.map(row => ({
    ...mapUserOverviewRow(row, caseWorkerNames),
    status: 'assigned' as TaskStatus,
  }));
  const allTasks = shouldFetchAssigned ? [...assignedTasksAll, ...completedTasks] : completedTasks;
  const overview = userOverviewService.buildUserOverview(allTasks);
  const facetedFilterState = requestedSection
    ? { filters, filterOptions: emptyOverviewFilterOptions() }
    : await fetchFacetedFilterStateWithFallback({
        errorMessage: 'Failed to fetch user overview filter options from database',
        snapshotId: snapshotContext.snapshotId,
        filters,
        queryOptions: USER_OVERVIEW_QUERY_OPTIONS,
        changedFilter,
        includeUserFilter: true,
      });
  const resolvedFilters = facetedFilterState.filters;
  const filterOptions = facetedFilterState.filterOptions;

  const completedByDate: CompletedByDatePoint[] = completedByDateRows.map(row => ({
    date: row.date_key,
    tasks: row.tasks,
    withinDue: row.within_due,
    beyondDue: row.beyond_due,
    handlingTimeSum: row.handling_time_sum ?? 0,
    handlingTimeCount: row.handling_time_count,
  }));
  const completedByTaskName: CompletedByTaskNameAggregate[] = completedByTaskNameRows.map(row => ({
    taskName: row.task_name ?? 'Unknown',
    tasks: row.tasks,
    handlingTimeSum: row.handling_time_sum ?? 0,
    handlingTimeCount: row.handling_time_count,
    daysBeyondSum: row.days_beyond_sum ?? 0,
    daysBeyondCount: row.days_beyond_count,
  }));
  const completedByDateTotals = completedByDate.reduce(
    (acc, row) => ({
      tasks: acc.tasks + row.tasks,
      withinDue: acc.withinDue + row.withinDue,
    }),
    { tasks: 0, withinDue: 0 }
  );
  const completedComplianceSummary = {
    total: completedCompliance?.total ?? completedByDateTotals.tasks,
    withinDueYes: completedCompliance?.within ?? completedByDateTotals.withinDue,
    withinDueNo:
      completedCompliance?.within !== undefined
        ? completedCompliance.total - completedCompliance.within
        : completedByDateTotals.tasks - completedByDateTotals.withinDue,
  };

  return buildUserOverviewViewModel({
    filters: resolvedFilters,
    snapshotId: snapshotContext.snapshotId,
    snapshotToken: snapshotContext.snapshotToken,
    overview,
    allTasks,
    assignedTasks,
    completedTasks,
    assignedTotalResults,
    completedTotalResults,
    completedByDate,
    completedByTaskName,
    completedComplianceSummary,
    filterOptions,
    locationDescriptions,
    sort,
    assignedPage: resolvedAssignedPage,
    completedPage: resolvedCompletedPage,
    freshnessInsetText: snapshotContext.freshnessInsetText,
  });
}
