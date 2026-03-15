import { buildFilterOptionsViewModel } from '../shared/filters';
import { formatAnalyticsDateDisplay, formatDatePickerValue, formatNumber, formatPercent } from '../shared/formatting';
import { FilterOptions } from '../shared/services';
import {
  AnalyticsFilters,
  CompletedByLocationRow,
  CompletedByRegionRow,
  CompletedMetric,
  CompletedProcessingHandlingPoint,
  CompletedResponse,
  Task,
} from '../shared/types';
import { buildRollingAverage, lookup } from '../shared/utils';
import { getUserOptions } from '../shared/viewModels/filterOptions';
import type { AnalyticsSectionErrors } from '../shared/viewModels/sectionErrors';
import { sumBy } from '../shared/viewModels/totalsRow';

import {
  buildCompletedByNameChart,
  buildComplianceChart,
  buildHandlingChart,
  buildProcessingHandlingTimeChart,
  buildTimelineChart,
} from './visuals/charts';

export type TaskAuditEntry = {
  caseId: string;
  taskName: string | null;
  agentName: string | null;
  completedDate: string;
  completedDateRaw: string;
  totalAssignments: number;
  location: string | null;
  status: string | null;
  outcome: string | null;
};

type CompletedViewModel = ReturnType<typeof buildFilterOptionsViewModel> & {
  filters: AnalyticsFilters;
  snapshotId?: number;
  snapshotToken?: string;
  freshnessInsetText: string;
  sectionErrors: AnalyticsSectionErrors<
    | 'completed-summary'
    | 'completed-timeline'
    | 'completed-by-name'
    | 'completed-task-audit'
    | 'completed-by-region-location'
    | 'completed-processing-handling-time'
    | 'shared-filters'
  >;
  completedFromValue: string;
  completedToValue: string;
  summary: CompletedResponse['summary'];
  charts: {
    complianceToday: string;
    complianceRange: string;
    timeline: string;
    completedByName: string;
    handling: string;
    processingHandlingTime: string;
  };
  completedByNameRows: TableRow[];
  completedByNameTotalsRow: TableRowCell[];
  timelineRows: TableRow[];
  timelineTotalsRow: TableRowCell[];
  complianceTodayRows: { key: { text: string }; value: { text: string } }[];
  complianceRangeRows: { key: { text: string }; value: { text: string } }[];
  handlingRows: { key: { text: string }; value: { text: string } }[];
  processingHandlingRows: TableRow[];
  processingHandlingTotalsRow: TableRowCell[];
  processingHandlingMetric: CompletedMetric;
  processingHandlingOverallLabel: string;
  processingHandlingOverallAverage: string;
  userOptions: { value: string; text: string }[];
  completedByRegionRows: TableRow[];
  completedByRegionTotalsRow: TableRowCell[];
  completedByLocationRows: TableRow[];
  completedByLocationTotalsRow: TableRowCell[];
  completedByRegionLocationRows: TableRow[];
  completedByRegionLocationTotalsRow: TableRowCell[];
  taskAuditRows: TaskAuditEntry[];
  taskAuditCaseId: string;
  taskAuditEmptyState: string;
};

type HandlingStats = CompletedResponse['handlingTimeStats'];
type TableRowCell = { text: string; attributes?: Record<string, string> };
type TableRow = TableRowCell[];

function buildNumericCell(value: number, options: Intl.NumberFormatOptions = {}): TableRowCell {
  return { text: formatNumber(value, options), attributes: { 'data-sort-value': String(value) } };
}

function buildPercentCell(value: number, options: Intl.NumberFormatOptions = {}): TableRowCell {
  return { text: formatPercent(value, options), attributes: { 'data-sort-value': String(value) } };
}

function buildOptionalNumericCell(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {}
): TableRowCell {
  if (typeof value !== 'number') {
    return { text: '-' };
  }
  return buildNumericCell(value, options);
}

function buildTotalLabelCell(label: string): TableRowCell {
  return { text: label, attributes: { 'data-total-row': 'true' } };
}

function buildTotalsRowWithLabelColumns(
  label: string,
  labelColumns: number,
  values: number[],
  trailingBlanks = 0
): TableRow {
  const prefix = Array.from({ length: Math.max(0, labelColumns - 1) }).map(() => ({ text: '' }));
  const blanks = Array.from({ length: Math.max(0, trailingBlanks) }).map(() => ({ text: '' }));
  return [buildTotalLabelCell(label), ...prefix, ...values.map(value => buildNumericCell(value)), ...blanks];
}

function buildProcessingHandlingRows(rows: CompletedProcessingHandlingPoint[], metric: CompletedMetric): TableRow[] {
  return rows.map(row => {
    const average = metric === 'handlingTime' ? row.handlingAverageDays : row.processingAverageDays;
    const stddev = metric === 'handlingTime' ? row.handlingStdDevDays : row.processingStdDevDays;
    const upperRange = average + stddev;
    const lowerRange = Math.max(0, average - stddev);
    return [
      {
        text: formatAnalyticsDateDisplay(row.date),
        attributes: { 'data-sort-value': row.date, 'data-export-value': row.date },
      },
      buildNumericCell(row.tasks),
      buildNumericCell(average, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      buildNumericCell(upperRange, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      buildNumericCell(lowerRange, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ];
  });
}

function buildProcessingHandlingOverallAverage(
  rows: CompletedProcessingHandlingPoint[],
  metric: CompletedMetric
): number {
  const totals = rows.reduce(
    (acc, row) => {
      if (metric === 'handlingTime') {
        acc.sum += row.handlingSumDays;
        acc.count += row.handlingCount;
      } else {
        acc.sum += row.processingSumDays;
        acc.count += row.processingCount;
      }
      return acc;
    },
    { sum: 0, count: 0 }
  );

  if (totals.count === 0) {
    return 0;
  }
  return totals.sum / totals.count;
}

function buildProcessingHandlingTotalsRow(
  rows: CompletedProcessingHandlingPoint[],
  metric: CompletedMetric
): TableRowCell[] {
  const totalTasks = rows.reduce((acc, row) => acc + row.tasks, 0);
  const overallAverage = buildProcessingHandlingOverallAverage(rows, metric);
  return [
    buildTotalLabelCell('Total'),
    buildNumericCell(totalTasks),
    buildNumericCell(overallAverage, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    { text: '-' },
    { text: '-' },
  ];
}

function buildCompletedByNameRows(rows: CompletedResponse['completedByName']): TableRow[] {
  return rows.map(row => [
    { text: row.taskName },
    buildNumericCell(row.tasks),
    buildNumericCell(row.withinDue),
    buildPercentCell(row.tasks === 0 ? 0 : (row.withinDue / row.tasks) * 100, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    buildNumericCell(row.beyondDue),
  ]);
}

function buildCompletedByNameTotalsRow(rows: CompletedResponse['completedByName']): TableRow {
  const totalTasks = sumBy(rows, row => row.tasks);
  const totalWithin = sumBy(rows, row => row.withinDue);
  const totalBeyond = sumBy(rows, row => row.beyondDue);
  const totalPct = totalTasks === 0 ? 0 : (totalWithin / totalTasks) * 100;
  return [
    buildTotalLabelCell('Total'),
    buildNumericCell(totalTasks),
    buildNumericCell(totalWithin),
    buildPercentCell(totalPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    buildNumericCell(totalBeyond),
  ];
}

function buildComplianceRows(summary: Pick<CompletedResponse['summary'], 'withinDueYes' | 'withinDueNo'>): {
  key: { text: string };
  value: { text: string };
}[] {
  return [
    { key: { text: 'Within due date' }, value: { text: formatNumber(summary.withinDueYes) } },
    { key: { text: 'Beyond due date' }, value: { text: formatNumber(summary.withinDueNo) } },
  ];
}

function buildTimelineRows(timeline: CompletedResponse['timeline']): TableRow[] {
  const rollingAverage = buildRollingAverage(
    timeline.map(point => point.completed),
    7
  );
  return timeline.map((point, index) => [
    {
      text: formatAnalyticsDateDisplay(point.date),
      attributes: { 'data-sort-value': point.date, 'data-export-value': point.date },
    },
    buildNumericCell(point.completed),
    buildNumericCell(point.withinDue),
    buildPercentCell(point.completed === 0 ? 0 : (point.withinDue / point.completed) * 100, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    buildNumericCell(point.beyondDue),
    buildNumericCell(rollingAverage[index] ?? 0),
  ]);
}

function buildTimelineTotalsRow(timeline: CompletedResponse['timeline']): TableRow {
  const totalCompleted = sumBy(timeline, row => row.completed);
  const totalWithin = sumBy(timeline, row => row.withinDue);
  const totalBeyond = sumBy(timeline, row => row.beyondDue);
  const totalPct = totalCompleted === 0 ? 0 : (totalWithin / totalCompleted) * 100;
  const rollingAverage = buildRollingAverage(
    timeline.map(point => point.completed),
    7
  );
  const lastRollingAverage = rollingAverage.length === 0 ? 0 : rollingAverage[rollingAverage.length - 1];

  return [
    buildTotalLabelCell('Total'),
    buildNumericCell(totalCompleted),
    buildNumericCell(totalWithin),
    buildPercentCell(totalPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    buildNumericCell(totalBeyond),
    buildNumericCell(lastRollingAverage),
  ];
}

function buildHandlingRows(stats: HandlingStats): { key: { text: string }; value: { text: string } }[] {
  return [
    {
      key: { text: 'Average days' },
      value: { text: formatNumber(stats.averageDays, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
    },
    {
      key: { text: 'Lower range' },
      value: { text: formatNumber(stats.lowerRange, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
    },
    {
      key: { text: 'Upper range' },
      value: { text: formatNumber(stats.upperRange, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
    },
  ];
}

function buildCompletedRegionRows(rows: CompletedByRegionRow[], regionLookup: Record<string, string>): TableRow[] {
  return rows
    .map(row => [
      { text: lookup(row.region ?? 'Unknown', regionLookup) },
      buildNumericCell(row.tasks),
      buildNumericCell(row.withinDue),
      buildNumericCell(row.beyondDue),
      buildOptionalNumericCell(row.handlingTimeDays, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      buildOptionalNumericCell(row.processingTimeDays, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    ])
    .sort((a, b) => a[0].text.localeCompare(b[0].text));
}

function buildCompletedLocationRows(
  rows: CompletedByLocationRow[],
  includeRegion: boolean,
  locationLookup: Record<string, string>,
  regionLookup: Record<string, string>
): TableRow[] {
  return rows
    .map(row => {
      const regionText = lookup(row.region ?? 'Unknown', regionLookup);
      const locationText = lookup(row.location ?? 'Unknown', locationLookup);
      const cells = includeRegion ? [{ text: regionText }, { text: locationText }] : [{ text: locationText }];
      return cells.concat([
        buildNumericCell(row.tasks),
        buildNumericCell(row.withinDue),
        buildNumericCell(row.beyondDue),
        buildOptionalNumericCell(row.handlingTimeDays, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        buildOptionalNumericCell(row.processingTimeDays, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
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

function buildCompletedRegionLocationTotals(
  rows: CompletedByLocationRow[] | CompletedByRegionRow[],
  labelColumns: number
): TableRow {
  let tasks = 0;
  let within = 0;
  let beyond = 0;
  rows.forEach(row => {
    tasks += row.tasks;
    within += row.withinDue;
    beyond += row.beyondDue;
  });
  return buildTotalsRowWithLabelColumns('Total', labelColumns, [tasks, within, beyond], 2);
}

export function buildCompletedViewModel(params: {
  filters: AnalyticsFilters;
  snapshotId?: number;
  snapshotToken?: string;
  freshnessInsetText: string;
  completed: CompletedResponse;
  allTasks: Task[];
  filterOptions: FilterOptions;
  completedByLocation: CompletedByLocationRow[];
  completedByRegion: CompletedByRegionRow[];
  regionDescriptions: Record<string, string>;
  locationDescriptions: Record<string, string>;
  taskAuditRows: TaskAuditEntry[];
  taskAuditCaseId: string;
  selectedMetric: CompletedMetric;
  sectionErrors: AnalyticsSectionErrors<
    | 'completed-summary'
    | 'completed-timeline'
    | 'completed-by-name'
    | 'completed-task-audit'
    | 'completed-by-region-location'
    | 'completed-processing-handling-time'
    | 'shared-filters'
  >;
}): CompletedViewModel {
  const {
    filters,
    snapshotId,
    snapshotToken,
    freshnessInsetText,
    completed,
    allTasks,
    filterOptions,
    completedByLocation,
    completedByRegion,
    regionDescriptions,
    locationDescriptions,
    taskAuditRows,
    taskAuditCaseId,
    selectedMetric,
    sectionErrors,
  } = params;

  const complianceTodayChart = buildComplianceChart({
    withinDueYes: completed.summary.withinDueTodayYes,
    withinDueNo: completed.summary.withinDueTodayNo,
  });
  const complianceRangeChart = buildComplianceChart({
    withinDueYes: completed.summary.withinDueYes,
    withinDueNo: completed.summary.withinDueNo,
  });
  const timelineChart = buildTimelineChart(completed.timeline);
  const completedByNameChart = buildCompletedByNameChart(completed.completedByName);
  const handlingStats = completed.handlingTimeStats;
  const handlingChart = buildHandlingChart(handlingStats);
  const processingHandlingChart = buildProcessingHandlingTimeChart(completed.processingHandlingTime, selectedMetric);
  const filterViewModel = buildFilterOptionsViewModel(filterOptions, allTasks);

  return {
    filters,
    snapshotId,
    snapshotToken,
    freshnessInsetText,
    sectionErrors,
    ...filterViewModel,
    completedFromValue: formatDatePickerValue(filters.completedFrom),
    completedToValue: formatDatePickerValue(filters.completedTo),
    summary: completed.summary,
    charts: {
      complianceToday: complianceTodayChart,
      complianceRange: complianceRangeChart,
      timeline: timelineChart,
      completedByName: completedByNameChart,
      handling: handlingChart,
      processingHandlingTime: processingHandlingChart,
    },
    completedByNameRows: buildCompletedByNameRows(completed.completedByName),
    completedByNameTotalsRow: buildCompletedByNameTotalsRow(completed.completedByName),
    complianceTodayRows: buildComplianceRows({
      withinDueYes: completed.summary.withinDueTodayYes,
      withinDueNo: completed.summary.withinDueTodayNo,
    }),
    complianceRangeRows: buildComplianceRows({
      withinDueYes: completed.summary.withinDueYes,
      withinDueNo: completed.summary.withinDueNo,
    }),
    timelineRows: buildTimelineRows(completed.timeline),
    timelineTotalsRow: buildTimelineTotalsRow(completed.timeline),
    handlingRows: buildHandlingRows(handlingStats),
    processingHandlingRows: buildProcessingHandlingRows(completed.processingHandlingTime, selectedMetric),
    processingHandlingTotalsRow: buildProcessingHandlingTotalsRow(completed.processingHandlingTime, selectedMetric),
    processingHandlingMetric: selectedMetric,
    processingHandlingOverallLabel:
      selectedMetric === 'handlingTime'
        ? 'Overall average of handling time (days)'
        : 'Overall average of processing time (days)',
    processingHandlingOverallAverage: formatNumber(
      buildProcessingHandlingOverallAverage(completed.processingHandlingTime, selectedMetric),
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ),
    userOptions: getUserOptions(allTasks),
    completedByRegionRows: buildCompletedRegionRows(completedByRegion, regionDescriptions),
    completedByRegionTotalsRow: buildCompletedRegionLocationTotals(completedByRegion, 1),
    completedByLocationRows: buildCompletedLocationRows(
      completedByLocation,
      false,
      locationDescriptions,
      regionDescriptions
    ),
    completedByLocationTotalsRow: buildCompletedRegionLocationTotals(completedByLocation, 1),
    completedByRegionLocationRows: buildCompletedLocationRows(
      completedByLocation,
      true,
      locationDescriptions,
      regionDescriptions
    ),
    completedByRegionLocationTotalsRow: buildCompletedRegionLocationTotals(completedByLocation, 2),
    taskAuditRows,
    taskAuditCaseId,
    taskAuditEmptyState: taskAuditCaseId
      ? 'No completed tasks match this case ID.'
      : 'Enter a case ID to see task audit results.',
  };
}

export const __testing = {
  buildCompletedRegionRows,
  buildCompletedLocationRows,
  buildPercentCell,
  buildOptionalNumericCell,
  buildTotalsRowWithLabelColumns,
};
