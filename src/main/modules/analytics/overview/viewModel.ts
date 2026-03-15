import { buildFilterOptionsViewModel } from '../shared/filters';
import { formatDatePickerValue, formatNumber, formatPercent } from '../shared/formatting';
import { FilterOptions } from '../shared/services';
import { AnalyticsFilters, OverviewResponse } from '../shared/types';
import { FilterOptionsViewModel } from '../shared/viewModels/filterOptions';
import type { AnalyticsSectionErrors } from '../shared/viewModels/sectionErrors';

type TaskEventsRow = {
  service: string;
  completed: number;
  cancelled: number;
  created: number;
};

type AnalyticsTask = { service: string; roleCategory: string; region: string; location: string; taskName: string };
type TableCell = { text: string; attributes?: Record<string, string> };
type TableRow = TableCell[];
type TableRows = TableRow[];

type OverviewViewModel = FilterOptionsViewModel & {
  filters: AnalyticsFilters;
  snapshotId?: number;
  snapshotToken?: string;
  freshnessInsetText: string;
  sectionErrors: AnalyticsSectionErrors<'overview-service-performance' | 'overview-task-events' | 'shared-filters'>;
  rows: OverviewResponse['serviceRows'];
  totals: OverviewResponse['totals'];
  tableRows: TableRows;
  totalsRow: TableRow;
  taskEventsRows: TableRows;
  taskEventsTotalsRow: TableRow;
  eventsFromValue: string;
  eventsToValue: string;
};

function buildNumericCell(value: number): TableCell {
  return { text: formatNumber(value), attributes: { 'data-sort-value': String(value) } };
}

function buildPercentCell(value: number): TableCell {
  return {
    text: formatPercent(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    attributes: { 'data-sort-value': String(value) },
  };
}

function buildTotalLabelCell(label: string): TableCell {
  return { text: label, attributes: { 'data-total-row': 'true' } };
}

function buildOverviewTableRows(rows: OverviewResponse['serviceRows']): TableRows {
  return rows.map(row => [
    { text: row.service },
    buildNumericCell(row.open),
    buildNumericCell(row.assigned),
    buildPercentCell(row.assignedPct),
    buildNumericCell(row.urgent),
    buildNumericCell(row.high),
    buildNumericCell(row.medium),
    buildNumericCell(row.low),
  ]);
}

function buildOverviewTotalsRow(totals: OverviewResponse['totals']): TableRow {
  return [
    buildTotalLabelCell(totals.service),
    buildNumericCell(totals.open),
    buildNumericCell(totals.assigned),
    buildPercentCell(totals.assignedPct),
    buildNumericCell(totals.urgent),
    buildNumericCell(totals.high),
    buildNumericCell(totals.medium),
    buildNumericCell(totals.low),
  ];
}

function buildTaskEventsRows(rows: TaskEventsRow[]): TableRows {
  return rows.map(row => [
    { text: row.service },
    buildNumericCell(row.created),
    buildNumericCell(row.completed),
    buildNumericCell(row.cancelled),
  ]);
}

function buildTaskEventsTotalsRow(totals: TaskEventsRow): TableRow {
  return [
    buildTotalLabelCell(totals.service),
    buildNumericCell(totals.created),
    buildNumericCell(totals.completed),
    buildNumericCell(totals.cancelled),
  ];
}

export function buildOverviewViewModel(params: {
  filters: AnalyticsFilters;
  snapshotId?: number;
  snapshotToken?: string;
  overview: OverviewResponse;
  filterOptions: FilterOptions;
  allTasks: AnalyticsTask[];
  taskEventsRows: TaskEventsRow[];
  taskEventsTotals: TaskEventsRow;
  eventsRange: { from: Date; to: Date };
  freshnessInsetText?: string;
  sectionErrors: AnalyticsSectionErrors<'overview-service-performance' | 'overview-task-events' | 'shared-filters'>;
}): OverviewViewModel {
  const {
    filters,
    snapshotId,
    snapshotToken,
    overview,
    filterOptions,
    allTasks,
    taskEventsRows,
    taskEventsTotals,
    eventsRange,
    freshnessInsetText = 'Data freshness unavailable.',
    sectionErrors,
  } = params;
  const filterViewModel = buildFilterOptionsViewModel(filterOptions, allTasks);
  const sortedRows = [...overview.serviceRows].sort((a, b) => a.service.localeCompare(b.service));

  return {
    filters,
    snapshotId,
    snapshotToken,
    freshnessInsetText,
    sectionErrors,
    ...filterViewModel,
    rows: sortedRows,
    totals: overview.totals,
    tableRows: buildOverviewTableRows(sortedRows),
    totalsRow: buildOverviewTotalsRow(overview.totals),
    taskEventsRows: buildTaskEventsRows(taskEventsRows),
    taskEventsTotalsRow: buildTaskEventsTotalsRow(taskEventsTotals),
    eventsFromValue: formatDatePickerValue(eventsRange.from),
    eventsToValue: formatDatePickerValue(eventsRange.to),
  };
}
