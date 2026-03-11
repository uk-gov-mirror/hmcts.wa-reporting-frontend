import { buildFilterOptionsViewModel } from '../shared/filters';
import { formatAnalyticsDateDisplay, formatDatePickerValue, formatNumber, formatPercent } from '../shared/formatting';
import { PaginationMeta } from '../shared/pagination';
import { prioritySortValue } from '../shared/priority/priorityRankSql';
import type { FilterOptions } from '../shared/services';
import { AnalyticsFilters, Task, TaskPriorityValue, UserOverviewResponse } from '../shared/types';
import { UserOverviewSort } from '../shared/userOverviewSort';
import { lookup, normaliseLabel, toNumber } from '../shared/utils';
import type { FilterOptionsViewModel, SelectOption } from '../shared/viewModels/filterOptions';
import { buildPriorityRows } from '../shared/viewModels/priorityRows';
import { TableHeadCell, buildSortHeadCell } from '../shared/viewModels/sortHead';

import { paginateAssignedTasks, paginateCompletedTasks } from './pagination';
import { CompletedByDatePoint, UserOverviewMetrics } from './service';
import { CompletedByTaskNameAggregate } from './types';
import {
  buildUserCompletedByDateChart,
  buildUserCompletedComplianceChart,
  buildUserPriorityChart,
} from './visuals/charts';

type UserOverviewViewModel = FilterOptionsViewModel & {
  filters: AnalyticsFilters;
  snapshotId?: number;
  snapshotToken?: string;
  freshnessInsetText: string;
  completedFromValue: string;
  completedToValue: string;
  userOptions: SelectOption[];
  prioritySummary: UserOverviewResponse['prioritySummary'];
  assignedSort: UserOverviewSort['assigned'];
  completedSort: UserOverviewSort['completed'];
  assignedHead: TableHeadCell[];
  completedHead: TableHeadCell[];
  assignedPagination: PaginationMeta;
  completedPagination: PaginationMeta;
  charts: {
    priority: string;
    completedByDate: string;
    completedCompliance: string;
  };
  assignedSummaryRows: { key: { text: string }; value: { text: string } }[];
  completedSummaryRows: { key: { text: string }; value: { text: string } }[];
  assignedRows: UserOverviewAssignedRow[];
  completedRows: UserOverviewCompletedRow[];
  completedByTaskNameRows: TableRow[];
  completedByTaskNameTotalsRow: TableRowCell[];
  completedByDateRows: TableRow[];
  completedByDateTotalsRow: TableRowCell[];
};

type TableRowCell = { text: string; attributes?: Record<string, string> };
type TableRow = TableRowCell[];

function buildNumericCell(value: number, options: Intl.NumberFormatOptions = {}): TableRowCell {
  return { text: formatNumber(value, options), attributes: { 'data-sort-value': String(value) } };
}

function buildPercentCell(value: number, options: Intl.NumberFormatOptions = {}): TableRowCell {
  return { text: formatPercent(value, options), attributes: { 'data-sort-value': String(value) } };
}

function buildAverageCell(valueSum: unknown, valueCount: unknown): TableRowCell {
  const sum = toNumber(valueSum, 0);
  const count = toNumber(valueCount, 0);
  if (count <= 0) {
    return { text: '-' };
  }
  const average = sum / count;
  return {
    text: formatNumber(average, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    attributes: { 'data-sort-value': String(average) },
  };
}

function buildTotalLabelCell(label: string): TableRowCell {
  return { text: label, attributes: { 'data-total-row': 'true' } };
}

type UserOverviewAssignedRow = {
  caseId: string;
  createdDate: string;
  createdDateRaw: string;
  taskName: string;
  assignedDate: string;
  assignedDateRaw: string;
  dueDate: string;
  dueDateRaw: string;
  priority: TaskPriorityValue;
  prioritySortValue: number;
  totalAssignments: string;
  assigneeName: string;
  location: string;
};

type UserOverviewCompletedRow = {
  caseId: string;
  createdDate: string;
  createdDateRaw: string;
  taskName: string;
  assignedDate: string;
  assignedDateRaw: string;
  dueDate: string;
  dueDateRaw: string;
  completedDate: string;
  completedDateRaw: string;
  handlingTimeDays: string;
  withinDue: string;
  totalAssignments: string;
  assigneeName: string;
  location: string;
};

function mapAssignedRow(row: Task, locationDescriptions: Record<string, string>): UserOverviewAssignedRow {
  const createdDateRaw = row.createdDate ?? '';
  const assignedDateRaw = row.assignedDate ?? '';
  const dueDateRaw = row.dueDate ?? '';
  return {
    caseId: row.caseId,
    createdDate: formatAnalyticsDateDisplay(createdDateRaw),
    createdDateRaw: createdDateRaw || '-',
    taskName: row.taskName,
    assignedDate: formatAnalyticsDateDisplay(assignedDateRaw),
    assignedDateRaw: assignedDateRaw || '-',
    dueDate: formatAnalyticsDateDisplay(dueDateRaw),
    dueDateRaw: dueDateRaw || '-',
    priority: row.priority,
    prioritySortValue: prioritySortValue(row.priority),
    totalAssignments: formatNumber(row.totalAssignments ?? 0),
    assigneeName: row.assigneeName ?? '',
    location: lookup(row.location, locationDescriptions),
  };
}

function mapCompletedRow(row: Task, locationDescriptions: Record<string, string>): UserOverviewCompletedRow {
  const createdDateRaw = row.createdDate ?? '';
  const assignedDateRaw = row.assignedDate ?? '';
  const dueDateRaw = row.dueDate ?? '';
  const completedDateRaw = row.completedDate ?? '';
  return {
    caseId: row.caseId,
    createdDate: formatAnalyticsDateDisplay(createdDateRaw),
    createdDateRaw: createdDateRaw || '-',
    taskName: row.taskName,
    assignedDate: formatAnalyticsDateDisplay(assignedDateRaw),
    assignedDateRaw: assignedDateRaw || '-',
    dueDate: formatAnalyticsDateDisplay(dueDateRaw),
    dueDateRaw: dueDateRaw || '-',
    completedDate: formatAnalyticsDateDisplay(completedDateRaw),
    completedDateRaw: completedDateRaw || '-',
    handlingTimeDays:
      row.handlingTimeDays !== undefined
        ? formatNumber(row.handlingTimeDays, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '-',
    withinDue: row.withinSla === null || row.withinSla === undefined ? '-' : row.withinSla ? 'Yes' : 'No',
    totalAssignments: formatNumber(row.totalAssignments ?? 0),
    assigneeName: row.assigneeName ?? '',
    location: lookup(row.location, locationDescriptions),
  };
}

type SortHeadContext = {
  sort: UserOverviewSort;
};

function buildAssignedHead(context: SortHeadContext): TableHeadCell[] {
  const { sort } = context;
  const current = sort.assigned;

  return [
    buildSortHeadCell({
      label: 'Case ID',
      sortKey: 'caseId',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Created date',
      sortKey: 'createdDate',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Task name',
      sortKey: 'taskName',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Assigned date',
      sortKey: 'assignedDate',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Due date',
      sortKey: 'dueDate',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Priority',
      sortKey: 'priority',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Total assignments',
      sortKey: 'totalAssignments',
      format: 'numeric',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Assignee',
      sortKey: 'assignee',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Location',
      sortKey: 'location',
      activeSort: current,
    }),
  ];
}

function buildCompletedHead(context: SortHeadContext): TableHeadCell[] {
  const { sort } = context;
  const current = sort.completed;

  return [
    buildSortHeadCell({
      label: 'Case ID',
      sortKey: 'caseId',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Created date',
      sortKey: 'createdDate',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Task name',
      sortKey: 'taskName',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Assigned date',
      sortKey: 'assignedDate',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Due date',
      sortKey: 'dueDate',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Completed date',
      sortKey: 'completedDate',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Handling time (days)',
      sortKey: 'handlingTimeDays',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Within due date',
      sortKey: 'withinDue',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Total assignments',
      sortKey: 'totalAssignments',
      format: 'numeric',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Assignee',
      sortKey: 'assignee',
      activeSort: current,
    }),
    buildSortHeadCell({
      label: 'Location',
      sortKey: 'location',
      activeSort: current,
    }),
  ];
}

function buildCompletedByDateRows(rows: CompletedByDatePoint[]): TableRow[] {
  return rows.map(row => [
    {
      text: formatAnalyticsDateDisplay(row.date),
      attributes: { 'data-sort-value': row.date, 'data-export-value': row.date },
    },
    buildNumericCell(row.tasks),
    buildNumericCell(row.withinDue),
    buildPercentCell(row.tasks === 0 ? 0 : (row.withinDue / row.tasks) * 100, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    buildNumericCell(row.beyondDue),
    buildAverageCell(row.handlingTimeSum, row.handlingTimeCount),
  ]);
}

function buildCompletedByDateTotalsRow(rows: CompletedByDatePoint[]): TableRow {
  const totals = rows.reduce(
    (acc, row) => ({
      tasks: acc.tasks + row.tasks,
      withinDue: acc.withinDue + row.withinDue,
      beyondDue: acc.beyondDue + row.beyondDue,
      handlingTimeSum: acc.handlingTimeSum + row.handlingTimeSum,
      handlingTimeCount: acc.handlingTimeCount + row.handlingTimeCount,
    }),
    { tasks: 0, withinDue: 0, beyondDue: 0, handlingTimeSum: 0, handlingTimeCount: 0 }
  );
  return [
    buildTotalLabelCell('Total'),
    buildNumericCell(totals.tasks),
    buildNumericCell(totals.withinDue),
    buildPercentCell(totals.tasks === 0 ? 0 : (totals.withinDue / totals.tasks) * 100, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    buildNumericCell(totals.beyondDue),
    buildAverageCell(totals.handlingTimeSum, totals.handlingTimeCount),
  ];
}

export function buildUserOverviewViewModel(params: {
  filters: AnalyticsFilters;
  snapshotId?: number;
  snapshotToken?: string;
  freshnessInsetText: string;
  overview: UserOverviewMetrics;
  allTasks: Task[];
  assignedTasks: Task[];
  completedTasks: Task[];
  assignedTotalResults: number;
  completedTotalResults: number;
  completedComplianceSummary: {
    total: number;
    withinDueYes: number;
    withinDueNo: number;
  };
  completedByDate: CompletedByDatePoint[];
  completedByTaskName: CompletedByTaskNameAggregate[];
  filterOptions: FilterOptions;
  locationDescriptions: Record<string, string>;
  sort: UserOverviewSort;
  assignedPage: number;
  completedPage: number;
}): UserOverviewViewModel {
  const {
    filters,
    snapshotId,
    snapshotToken,
    freshnessInsetText,
    overview,
    allTasks,
    assignedTasks,
    completedTasks,
    assignedTotalResults,
    completedTotalResults,
    completedComplianceSummary,
    completedByDate,
    completedByTaskName,
    filterOptions,
    locationDescriptions,
    sort,
    assignedPage,
    completedPage,
  } = params;
  const userOptions = filterOptions.users.length > 0 ? filterOptions.users : [{ value: '', text: 'All users' }];

  const priorityChart = buildUserPriorityChart(overview.prioritySummary);
  const completedByDateChart = buildUserCompletedByDateChart(completedByDate);
  const completedComplianceChart = buildUserCompletedComplianceChart(completedComplianceSummary);
  const filterViewModel = buildFilterOptionsViewModel(filterOptions, allTasks);
  const completedByTaskNameAggregates = completedByTaskName
    .map(row => ({
      ...row,
      taskName: normaliseLabel(row.taskName, 'Unknown'),
    }))
    .sort((a, b) => b.tasks - a.tasks || a.taskName.localeCompare(b.taskName));
  const completedByTaskNameTotals = completedByTaskNameAggregates.reduce(
    (acc, row) => ({
      tasks: acc.tasks + row.tasks,
      handlingTimeSum: acc.handlingTimeSum + (Number.isFinite(row.handlingTimeSum) ? row.handlingTimeSum : 0),
      handlingTimeCount: acc.handlingTimeCount + (Number.isFinite(row.handlingTimeCount) ? row.handlingTimeCount : 0),
      daysBeyondSum: acc.daysBeyondSum + (Number.isFinite(row.daysBeyondSum) ? row.daysBeyondSum : 0),
      daysBeyondCount: acc.daysBeyondCount + (Number.isFinite(row.daysBeyondCount) ? row.daysBeyondCount : 0),
    }),
    { tasks: 0, handlingTimeSum: 0, handlingTimeCount: 0, daysBeyondSum: 0, daysBeyondCount: 0 }
  );
  const { pagedRows: assignedPagedRows, pagination: assignedPagination } = paginateAssignedTasks({
    rows: assignedTasks,
    totalResults: assignedTotalResults,
    filters,
    sort: sort.assigned,
    page: assignedPage,
  });
  const { pagedRows: completedPagedRows, pagination: completedPagination } = paginateCompletedTasks({
    rows: completedTasks,
    totalResults: completedTotalResults,
    filters,
    sort: sort.completed,
    page: completedPage,
  });

  return {
    filters,
    snapshotId,
    snapshotToken,
    freshnessInsetText,
    ...filterViewModel,
    completedFromValue: formatDatePickerValue(filters.completedFrom),
    completedToValue: formatDatePickerValue(filters.completedTo),
    userOptions,
    prioritySummary: overview.prioritySummary,
    assignedSort: sort.assigned,
    completedSort: sort.completed,
    assignedHead: buildAssignedHead({ sort }),
    completedHead: buildCompletedHead({ sort }),
    assignedPagination,
    completedPagination,
    charts: {
      priority: priorityChart,
      completedByDate: completedByDateChart,
      completedCompliance: completedComplianceChart,
    },
    assignedSummaryRows: [
      { key: { text: 'Total assigned' }, value: { text: formatNumber(overview.assigned.length) } },
      ...buildPriorityRows(overview.prioritySummary).map(row => ({
        key: { text: row.label },
        value: { text: row.value },
      })),
    ],
    completedSummaryRows: [
      { key: { text: 'Completed' }, value: { text: formatNumber(completedComplianceSummary.total) } },
      { key: { text: 'Within due date' }, value: { text: formatNumber(completedComplianceSummary.withinDueYes) } },
      { key: { text: 'Beyond due date' }, value: { text: formatNumber(completedComplianceSummary.withinDueNo) } },
    ],
    assignedRows: assignedPagedRows.map(row => mapAssignedRow(row, locationDescriptions)),
    completedRows: completedPagedRows.map(row => mapCompletedRow(row, locationDescriptions)),
    completedByTaskNameRows: completedByTaskNameAggregates.map(row => [
      { text: row.taskName },
      buildNumericCell(row.tasks),
      buildAverageCell(row.handlingTimeSum, row.handlingTimeCount),
      buildAverageCell(row.daysBeyondSum, row.daysBeyondCount),
    ]),
    completedByTaskNameTotalsRow: [
      buildTotalLabelCell('Total'),
      buildNumericCell(completedByTaskNameTotals.tasks),
      buildAverageCell(completedByTaskNameTotals.handlingTimeSum, completedByTaskNameTotals.handlingTimeCount),
      buildAverageCell(completedByTaskNameTotals.daysBeyondSum, completedByTaskNameTotals.daysBeyondCount),
    ],
    completedByDateRows: buildCompletedByDateRows(completedByDate),
    completedByDateTotalsRow: buildCompletedByDateTotalsRow(completedByDate),
  };
}

export const __testing = {
  buildPercentCell,
  mapAssignedRow,
  mapCompletedRow,
};
