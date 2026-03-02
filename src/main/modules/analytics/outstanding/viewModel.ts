import { buildFilterOptionsViewModel } from '../shared/filters';
import { formatAnalyticsDateDisplay, formatNumber, formatPercent } from '../shared/formatting';
import { OutstandingSort } from '../shared/outstandingSort';
import { prioritySortValue } from '../shared/priority/priorityRankSql';
import { FilterOptions } from '../shared/services';
import {
  AnalyticsFilters,
  AssignmentSeriesPoint,
  CriticalTask,
  DueByDatePoint,
  OutstandingByLocationRow,
  OutstandingByRegionRow,
  PriorityBreakdown,
  PrioritySeriesPoint,
  WaitTimePoint,
} from '../shared/types';
import { lookup } from '../shared/utils';
import { FilterOptionsViewModel } from '../shared/viewModels/filterOptions';
import { buildPriorityRows } from '../shared/viewModels/priorityRows';
import { TableHeadCell, buildSortHeadCell } from '../shared/viewModels/sortHead';
import { sumBy } from '../shared/viewModels/totalsRow';

import { CriticalTasksPagination, paginateCriticalTasks } from './criticalTasksPagination';

type OpenByNameInitial = {
  breakdown: PriorityBreakdown[];
  totals: PriorityBreakdown;
  chart: Record<string, unknown>;
};

type TableCell = { text: string; attributes?: Record<string, string> };
type TableRow = TableCell[];
type TableRows = TableRow[];
type CriticalTaskView = CriticalTask & {
  createdDateIso: string;
  createdDateDisplay: string;
  dueDateIso?: string;
  dueDateDisplay: string;
  prioritySortValue: number;
};

type OpenTasksTotals = { open: number; assigned: number; unassigned: number };
type WaitTimeTotals = { assignedCount: number; weightedTotal: number; average: number };
type DueTotals = { totalDue: number; open: number; completed: number };
type PriorityTotals = { urgent: number; high: number; medium: number; low: number };
type OutstandingTotals = { open: number; urgent: number; high: number; medium: number; low: number };
const waitTimeDecimalOptions: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function buildNumericCell(value: number, options: Intl.NumberFormatOptions = {}): TableCell {
  return { text: formatNumber(value, options), attributes: { 'data-sort-value': String(value) } };
}

function buildPercentCell(value: number, options: Intl.NumberFormatOptions = {}): TableCell {
  return { text: formatPercent(value, options), attributes: { 'data-sort-value': String(value) } };
}

function buildTotalLabelCell(label: string): TableCell {
  return { text: label, attributes: { 'data-total-row': 'true' } };
}

function buildDateCell(value?: string | null): TableCell {
  const dateIso = value ?? '';
  return {
    text: formatAnalyticsDateDisplay(value),
    attributes: {
      'data-sort-value': dateIso,
      'data-export-value': dateIso || '-',
    },
  };
}

function buildTotalsRowWithLabelColumns(label: string, labelColumns: number, values: number[]): TableRow {
  const prefix = Array.from({ length: Math.max(0, labelColumns - 1) }).map(() => ({ text: '' }));
  return [buildTotalLabelCell(label), ...prefix, ...values.map(value => buildNumericCell(value))];
}

export type OutstandingViewModel = FilterOptionsViewModel & {
  filters: AnalyticsFilters;
  snapshotId?: number;
  snapshotToken?: string;
  freshnessInsetText: string;
  criticalTasksSort: OutstandingSort['criticalTasks'];
  criticalTasksHead: TableHeadCell[];
  criticalTasks: CriticalTaskView[];
  criticalTasksPagination: CriticalTasksPagination;
  summary: {
    open: number;
    assigned: number;
    unassigned: number;
    assignedPct: number;
    unassignedPct: number;
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  charts: {
    openTasks: string;
    waitTime: string;
    tasksDue: string;
    tasksDueByPriority: string;
    priorityDonut: string;
    assignmentDonut: string;
  };
  openByNameInitial: OpenByNameInitial;
  openByNameRows: TableRows;
  openByNameTotalsRow: TableRow;
  openTasksRows: TableRows;
  openTasksTotalsRow: TableRow;
  waitTimeRows: TableRows;
  waitTimeTotalsRow: TableRow;
  tasksDueRows: TableRows;
  tasksDueTotalsRow: TableRow;
  tasksDuePriorityRows: TableRows;
  tasksDuePriorityTotalsRow: TableRow;
  priorityTableRows: TableRows;
  outstandingByRegionRows: TableRows;
  outstandingByRegionTotalsRow: TableRow;
  outstandingByLocationRows: TableRows;
  outstandingByLocationTotalsRow: TableRow;
  outstandingByRegionLocationRows: TableRows;
  outstandingByRegionLocationTotalsRow: TableRow;
};

function buildOpenByNameRows(breakdown: PriorityBreakdown[]): TableRows {
  return breakdown.map(row => [
    { text: row.name },
    buildNumericCell(row.urgent + row.high + row.medium + row.low),
    buildNumericCell(row.urgent),
    buildNumericCell(row.high),
    buildNumericCell(row.medium),
    buildNumericCell(row.low),
  ]);
}

function buildOpenByNameTotalsRow(totals: PriorityBreakdown): TableRow {
  return [
    buildTotalLabelCell(totals.name),
    buildNumericCell(totals.urgent + totals.high + totals.medium + totals.low),
    buildNumericCell(totals.urgent),
    buildNumericCell(totals.high),
    buildNumericCell(totals.medium),
    buildNumericCell(totals.low),
  ];
}

function calculateOpenTasksTotals(openByCreated: AssignmentSeriesPoint[]): OpenTasksTotals {
  return {
    open: sumBy(openByCreated, point => point.open),
    assigned: sumBy(openByCreated, point => point.assigned),
    unassigned: sumBy(openByCreated, point => point.unassigned),
  };
}

function buildOpenTasksRows(openByCreated: AssignmentSeriesPoint[]): TableRows {
  return openByCreated.map(point => [
    buildDateCell(point.date),
    buildNumericCell(point.open),
    buildNumericCell(point.assigned),
    buildPercentCell(point.assignedPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    buildNumericCell(point.unassigned),
    buildPercentCell(point.unassignedPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  ]);
}

function buildOpenTasksTotalsRow(openTasksTotals: OpenTasksTotals): TableRow {
  const assignedPct = openTasksTotals.open === 0 ? 0 : (openTasksTotals.assigned / openTasksTotals.open) * 100;
  const unassignedPct = openTasksTotals.open === 0 ? 0 : (openTasksTotals.unassigned / openTasksTotals.open) * 100;
  return [
    buildTotalLabelCell('Total'),
    buildNumericCell(openTasksTotals.open),
    buildNumericCell(openTasksTotals.assigned),
    buildPercentCell(assignedPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    buildNumericCell(openTasksTotals.unassigned),
    buildPercentCell(unassignedPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  ];
}

function calculateWaitTimeTotals(waitTime: WaitTimePoint[]): WaitTimeTotals {
  const assignedCount = sumBy(waitTime, point => point.assignedCount);
  const weightedTotal = sumBy(waitTime, point => point.averageWaitDays * point.assignedCount);
  const average = assignedCount === 0 ? 0 : weightedTotal / assignedCount;
  return { assignedCount, weightedTotal, average };
}

function buildWaitTimeRows(waitTime: WaitTimePoint[]): TableRows {
  return waitTime.map(point => [
    buildDateCell(point.date),
    buildNumericCell(point.assignedCount),
    buildNumericCell(point.averageWaitDays, waitTimeDecimalOptions),
  ]);
}

function buildWaitTimeTotalsRow(waitTimeTotals: WaitTimeTotals): TableRow {
  return [
    buildTotalLabelCell('Total'),
    buildNumericCell(waitTimeTotals.assignedCount),
    buildNumericCell(waitTimeTotals.average, waitTimeDecimalOptions),
  ];
}

function calculateDueTotals(dueByDate: DueByDatePoint[]): DueTotals {
  return {
    totalDue: sumBy(dueByDate, point => point.totalDue),
    open: sumBy(dueByDate, point => point.open),
    completed: sumBy(dueByDate, point => point.completed),
  };
}

function buildTasksDueRows(dueByDate: DueByDatePoint[]): TableRows {
  return dueByDate.map(point => [
    buildDateCell(point.date),
    buildNumericCell(point.totalDue),
    buildNumericCell(point.open),
    buildNumericCell(point.completed),
  ]);
}

function buildTasksDueTotalsRow(dueTotals: DueTotals): TableRow {
  return [
    buildTotalLabelCell('Total'),
    buildNumericCell(dueTotals.totalDue),
    buildNumericCell(dueTotals.open),
    buildNumericCell(dueTotals.completed),
  ];
}

function calculatePriorityTotals(priorityByDueDate: PrioritySeriesPoint[]): PriorityTotals {
  return {
    urgent: sumBy(priorityByDueDate, point => point.urgent),
    high: sumBy(priorityByDueDate, point => point.high),
    medium: sumBy(priorityByDueDate, point => point.medium),
    low: sumBy(priorityByDueDate, point => point.low),
  };
}

function buildTasksDuePriorityRows(priorityByDueDate: PrioritySeriesPoint[]): TableRows {
  return priorityByDueDate.map(point => [
    buildDateCell(point.date),
    buildNumericCell(point.urgent + point.high + point.medium + point.low),
    buildNumericCell(point.urgent),
    buildNumericCell(point.high),
    buildNumericCell(point.medium),
    buildNumericCell(point.low),
  ]);
}

function buildTasksDuePriorityTotalsRow(priorityTotals: PriorityTotals): TableRow {
  return [
    buildTotalLabelCell('Total'),
    buildNumericCell(priorityTotals.urgent + priorityTotals.high + priorityTotals.medium + priorityTotals.low),
    buildNumericCell(priorityTotals.urgent),
    buildNumericCell(priorityTotals.high),
    buildNumericCell(priorityTotals.medium),
    buildNumericCell(priorityTotals.low),
  ];
}

function buildPriorityTableRows(summary: { urgent: number; high: number; medium: number; low: number }): TableRows {
  return buildPriorityRows(summary).map(row => [{ text: row.label }, { text: row.value }]);
}

function buildCriticalTasks(criticalTasks: CriticalTask[], locationLookup: Record<string, string>): CriticalTaskView[] {
  return criticalTasks.map(task => ({
    ...task,
    location: lookup(task.location, locationLookup),
    createdDateIso: task.createdDate,
    createdDateDisplay: formatAnalyticsDateDisplay(task.createdDate),
    dueDateIso: task.dueDate,
    dueDateDisplay: formatAnalyticsDateDisplay(task.dueDate),
    prioritySortValue: prioritySortValue(task.priority),
  }));
}

function buildCriticalTasksHead(sort: OutstandingSort): TableHeadCell[] {
  const current = sort.criticalTasks;
  return [
    buildSortHeadCell({ label: 'Case ID', sortKey: 'caseId', activeSort: current }),
    buildSortHeadCell({ label: 'Case type', sortKey: 'caseType', activeSort: current }),
    buildSortHeadCell({ label: 'Location', sortKey: 'location', activeSort: current }),
    buildSortHeadCell({ label: 'Task name', sortKey: 'taskName', activeSort: current }),
    buildSortHeadCell({ label: 'Created date', sortKey: 'createdDate', activeSort: current }),
    buildSortHeadCell({ label: 'Due date', sortKey: 'dueDate', activeSort: current }),
    buildSortHeadCell({ label: 'Priority', sortKey: 'priority', defaultDir: 'desc', activeSort: current }),
    buildSortHeadCell({ label: 'Agent name', sortKey: 'agentName', activeSort: current }),
  ];
}

function calculateOutstandingTotals(rows: OutstandingTotals[]): OutstandingTotals {
  return rows.reduce(
    (acc, row) => ({
      open: acc.open + row.open,
      urgent: acc.urgent + row.urgent,
      high: acc.high + row.high,
      medium: acc.medium + row.medium,
      low: acc.low + row.low,
    }),
    { open: 0, urgent: 0, high: 0, medium: 0, low: 0 }
  );
}

function buildOutstandingTotalsRow(totals: OutstandingTotals, labelColumns: number): TableRow {
  return buildTotalsRowWithLabelColumns('Total', labelColumns, [
    totals.open,
    totals.urgent,
    totals.high,
    totals.medium,
    totals.low,
  ]);
}

function buildOutstandingRegionRows(rows: OutstandingByRegionRow[], regionLookup: Record<string, string>): TableRows {
  return rows
    .map(row => [
      { text: lookup(row.region, regionLookup) },
      buildNumericCell(row.open),
      buildNumericCell(row.urgent),
      buildNumericCell(row.high),
      buildNumericCell(row.medium),
      buildNumericCell(row.low),
    ])
    .sort((a, b) => a[0].text.localeCompare(b[0].text));
}

function buildOutstandingLocationRows(
  rows: OutstandingByLocationRow[],
  includeRegion: boolean,
  locationLookup: Record<string, string>,
  regionLookup: Record<string, string>
): TableRows {
  return rows
    .map(row => {
      const locationText = lookup(row.location, locationLookup);
      const cells = includeRegion
        ? [{ text: lookup(row.region, regionLookup) }, { text: locationText }]
        : [{ text: locationText }];
      return cells.concat([
        buildNumericCell(row.open),
        buildNumericCell(row.urgent),
        buildNumericCell(row.high),
        buildNumericCell(row.medium),
        buildNumericCell(row.low),
      ]);
    })
    .sort((a, b) => {
      const primary = a[0].text.localeCompare(b[0].text);
      if (primary !== 0) {
        return primary;
      }
      if (includeRegion) {
        return a[1].text.localeCompare(b[1].text);
      }
      return 0;
    });
}

export function buildOutstandingViewModel(params: {
  filters: AnalyticsFilters;
  snapshotId?: number;
  snapshotToken?: string;
  freshnessInsetText: string;
  filterOptions: FilterOptions;
  sort: OutstandingSort;
  criticalTasksPage: number;
  criticalTasksTotalResults: number;
  allTasks: { service: string; roleCategory: string; region: string; location: string; taskName: string }[];
  summary: {
    open: number;
    assigned: number;
    unassigned: number;
    assignedPct: number;
    unassignedPct: number;
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  charts: {
    openTasks: string;
    waitTime: string;
    tasksDue: string;
    tasksDueByPriority: string;
    priorityDonut: string;
    assignmentDonut: string;
  };
  openByNameInitial: OpenByNameInitial;
  openByCreated: AssignmentSeriesPoint[];
  waitTime: WaitTimePoint[];
  dueByDate: DueByDatePoint[];
  priorityByDueDate: PrioritySeriesPoint[];
  criticalTasks: CriticalTask[];
  outstandingByLocation: OutstandingByLocationRow[];
  outstandingByRegion: OutstandingByRegionRow[];
  regionDescriptions: Record<string, string>;
  locationDescriptions: Record<string, string>;
}): OutstandingViewModel {
  const {
    filters,
    snapshotId,
    snapshotToken,
    freshnessInsetText,
    filterOptions,
    sort,
    criticalTasksPage,
    criticalTasksTotalResults,
    allTasks,
    summary,
    charts,
    openByNameInitial,
    openByCreated,
    waitTime,
    dueByDate,
    priorityByDueDate,
    criticalTasks,
    outstandingByLocation,
    outstandingByRegion,
    regionDescriptions,
    locationDescriptions,
  } = params;

  const filterViewModel = buildFilterOptionsViewModel(filterOptions, allTasks);
  const { pagedTasks, pagination } = paginateCriticalTasks({
    tasks: criticalTasks,
    totalResults: criticalTasksTotalResults,
    filters,
    sort: sort.criticalTasks,
    page: criticalTasksPage,
  });
  const openTasksTotals = calculateOpenTasksTotals(openByCreated);
  const waitTimeTotals = calculateWaitTimeTotals(waitTime);
  const dueTotals = calculateDueTotals(dueByDate);
  const priorityTotals = calculatePriorityTotals(priorityByDueDate);
  const outstandingTotals = calculateOutstandingTotals(outstandingByLocation);

  return {
    filters,
    snapshotId,
    snapshotToken,
    freshnessInsetText,
    ...filterViewModel,
    criticalTasksSort: sort.criticalTasks,
    criticalTasksHead: buildCriticalTasksHead(sort),
    criticalTasks: buildCriticalTasks(pagedTasks, locationDescriptions),
    criticalTasksPagination: pagination,
    summary,
    charts,
    openByNameInitial,
    openByNameRows: buildOpenByNameRows(openByNameInitial.breakdown),
    openByNameTotalsRow: buildOpenByNameTotalsRow(openByNameInitial.totals),
    openTasksRows: buildOpenTasksRows(openByCreated),
    openTasksTotalsRow: buildOpenTasksTotalsRow(openTasksTotals),
    waitTimeRows: buildWaitTimeRows(waitTime),
    waitTimeTotalsRow: buildWaitTimeTotalsRow(waitTimeTotals),
    tasksDueRows: buildTasksDueRows(dueByDate),
    tasksDueTotalsRow: buildTasksDueTotalsRow(dueTotals),
    tasksDuePriorityRows: buildTasksDuePriorityRows(priorityByDueDate),
    tasksDuePriorityTotalsRow: buildTasksDuePriorityTotalsRow(priorityTotals),
    priorityTableRows: buildPriorityTableRows(summary),
    outstandingByRegionRows: buildOutstandingRegionRows(outstandingByRegion, regionDescriptions),
    outstandingByRegionTotalsRow: buildOutstandingTotalsRow(outstandingTotals, 1),
    outstandingByLocationRows: buildOutstandingLocationRows(
      outstandingByLocation,
      false,
      locationDescriptions,
      regionDescriptions
    ),
    outstandingByLocationTotalsRow: buildOutstandingTotalsRow(outstandingTotals, 1),
    outstandingByRegionLocationRows: buildOutstandingLocationRows(
      outstandingByLocation,
      true,
      locationDescriptions,
      regionDescriptions
    ),
    outstandingByRegionLocationTotalsRow: buildOutstandingTotalsRow(outstandingTotals, 2),
  };
}

export const __testing = {
  buildPercentCell,
  buildOutstandingLocationRows,
  buildOutstandingRegionRows,
};
