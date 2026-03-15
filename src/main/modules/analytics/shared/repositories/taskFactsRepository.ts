import { Prisma } from '@prisma/client';

import { tmPrisma } from '../data/prisma';
import { priorityRankSql } from '../priority/priorityRankSql';
import { AnalyticsFilters } from '../types';
import type { AnalyticsFacetScope } from '../filters';

import { AnalyticsQueryOptions, buildAnalyticsWhere } from './filters';
import { asOfSnapshotCondition } from './snapshotSql';
import {
  AssignmentRow,
  CompletedByLocationRow,
  CompletedByNameRow,
  CompletedByRegionRow,
  CompletedProcessingHandlingTimeRow,
  CompletedSummaryRow,
  CompletedTimelineRow,
  FilterValueRow,
  FilterValueWithTextRow,
  OpenTasksByNameRow,
  OpenTasksByRegionLocationRow,
  OverviewFilterOptionsRows,
  ServiceOverviewDbRow,
  SummaryTotalsRow,
  TaskEventsByServiceDbRow,
  TasksDuePriorityRow,
  UserOverviewAssignedSummaryRow,
} from './types';

type OverviewFilterOptionKind =
  | 'service'
  | 'roleCategory'
  | 'region'
  | 'location'
  | 'taskName'
  | 'workType'
  | 'assignee';

type OverviewFacetFilterKey = 'service' | 'roleCategory' | 'region' | 'location' | 'taskName' | 'workType' | 'user';

type OverviewFilterOptionRow = {
  option_type: OverviewFilterOptionKind;
  value: string;
  text: string;
};

type OverviewFilterOptionsParams = {
  scope?: AnalyticsFacetScope;
  filters?: AnalyticsFilters;
  queryOptions?: AnalyticsQueryOptions;
  includeUserFilter?: boolean;
};

type OverviewFilterOptionsInput = OverviewFilterOptionsParams | AnalyticsQueryOptions | undefined;

const overviewFacetFilterKeys: OverviewFacetFilterKey[] = [
  'service',
  'roleCategory',
  'region',
  'location',
  'taskName',
  'workType',
  'user',
];

function buildUserOverviewCompletedFactsWhere(
  snapshotId: number,
  filters: AnalyticsFilters,
  queryOptions?: AnalyticsQueryOptions
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [asOfSnapshotCondition(snapshotId)];
  if (filters.completedFrom) {
    conditions.push(Prisma.sql`completed_date >= ${filters.completedFrom}`);
  }
  if (filters.completedTo) {
    conditions.push(Prisma.sql`completed_date <= ${filters.completedTo}`);
  }
  if (filters.user && filters.user.length > 0) {
    conditions.push(Prisma.sql`assignee IN (${Prisma.join(filters.user)})`);
  }
  return buildAnalyticsWhere(filters, conditions, queryOptions);
}

export class TaskFactsRepository {
  private filterFactsTable(scope: AnalyticsFacetScope): Prisma.Sql {
    switch (scope) {
      case 'overview':
        return Prisma.raw('analytics.snapshot_overview_filter_facts');
      case 'outstanding':
        return Prisma.raw('analytics.snapshot_outstanding_filter_facts');
      case 'completed':
        return Prisma.raw('analytics.snapshot_completed_filter_facts');
      case 'userOverview':
        return Prisma.raw('analytics.snapshot_user_filter_facts');
      default:
        return Prisma.raw('analytics.snapshot_overview_filter_facts');
    }
  }

  private resolveOverviewFilterOptionsParams(params: OverviewFilterOptionsInput): OverviewFilterOptionsParams {
    if (!params) {
      return {};
    }
    if ('scope' in params || 'filters' in params || 'queryOptions' in params || 'includeUserFilter' in params) {
      return params as OverviewFilterOptionsParams;
    }
    return { queryOptions: params as AnalyticsQueryOptions };
  }

  private hasActiveOverviewFacetFilters(filters: AnalyticsFilters, includeUserFilter: boolean): boolean {
    return overviewFacetFilterKeys.some(key => {
      if (!includeUserFilter && key === 'user') {
        return false;
      }

      const values = filters[key];
      return Array.isArray(values) && values.length > 0;
    });
  }

  private shouldUseUnfilteredUserOverviewOptionsFastPath(params: {
    scope: AnalyticsFacetScope;
    filters: AnalyticsFilters;
    includeUserFilter: boolean;
  }): boolean {
    return (
      params.scope === 'userOverview' &&
      params.includeUserFilter &&
      !this.hasActiveOverviewFacetFilters(params.filters, params.includeUserFilter)
    );
  }

  private buildUnfilteredUserOverviewFilterOptionsQuery(
    snapshotId: number,
    queryOptions?: AnalyticsQueryOptions
  ): Prisma.Sql {
    const whereClause = buildAnalyticsWhere({}, [asOfSnapshotCondition(snapshotId)], queryOptions);

    return Prisma.sql`
      WITH grouped_options AS (
        SELECT
          CASE
            WHEN GROUPING(jurisdiction_label) = 0 THEN 'service'
            WHEN GROUPING(role_category_label) = 0 THEN 'roleCategory'
            WHEN GROUPING(region) = 0 THEN 'region'
            WHEN GROUPING(location) = 0 THEN 'location'
            WHEN GROUPING(task_name) = 0 THEN 'taskName'
            WHEN GROUPING(work_type) = 0 THEN 'workType'
            WHEN GROUPING(assignee) = 0 THEN 'assignee'
          END AS option_type,
          CASE
            WHEN GROUPING(jurisdiction_label) = 0 THEN jurisdiction_label::text
            WHEN GROUPING(role_category_label) = 0 THEN role_category_label::text
            WHEN GROUPING(region) = 0 THEN region::text
            WHEN GROUPING(location) = 0 THEN location::text
            WHEN GROUPING(task_name) = 0 THEN task_name::text
            WHEN GROUPING(work_type) = 0 THEN work_type::text
            WHEN GROUPING(assignee) = 0 THEN assignee::text
          END AS value
        FROM analytics.snapshot_user_filter_facts
        ${whereClause}
        GROUP BY GROUPING SETS (
          (jurisdiction_label),
          (role_category_label),
          (region),
          (location),
          (task_name),
          (work_type),
          (assignee)
        )
        HAVING
          (GROUPING(jurisdiction_label) = 0 AND jurisdiction_label IS NOT NULL)
          OR (GROUPING(role_category_label) = 0 AND role_category_label IS NOT NULL AND BTRIM(role_category_label) <> '')
          OR (GROUPING(region) = 0 AND region IS NOT NULL)
          OR (GROUPING(location) = 0 AND location IS NOT NULL)
          OR (GROUPING(task_name) = 0 AND task_name IS NOT NULL)
          OR (GROUPING(work_type) = 0 AND work_type IS NOT NULL)
          OR (GROUPING(assignee) = 0 AND assignee IS NOT NULL)
      )
      SELECT
        grouped_options.option_type,
        grouped_options.value,
        CASE
          WHEN grouped_options.option_type = 'workType'
            THEN COALESCE(work_types.label, grouped_options.value)
          ELSE grouped_options.value
        END AS text
      FROM grouped_options
      LEFT JOIN cft_task_db.work_types work_types
        ON grouped_options.option_type = 'workType'
       AND work_types.work_type_id = grouped_options.value
      ORDER BY grouped_options.option_type ASC, text ASC, grouped_options.value ASC
    `;
  }

  private mapOverviewFilterOptionRows(optionRows: OverviewFilterOptionRow[]): OverviewFilterOptionsRows {
    const services: FilterValueRow[] = [];
    const roleCategories: FilterValueRow[] = [];
    const regions: FilterValueRow[] = [];
    const locations: FilterValueRow[] = [];
    const taskNames: FilterValueRow[] = [];
    const workTypes: FilterValueWithTextRow[] = [];
    const assignees: FilterValueRow[] = [];

    for (const row of optionRows) {
      switch (row.option_type) {
        case 'service':
          services.push({ value: row.value });
          break;
        case 'roleCategory':
          roleCategories.push({ value: row.value });
          break;
        case 'region':
          regions.push({ value: row.value });
          break;
        case 'location':
          locations.push({ value: row.value });
          break;
        case 'taskName':
          taskNames.push({ value: row.value });
          break;
        case 'workType':
          workTypes.push({ value: row.value, text: row.text });
          break;
        case 'assignee':
          assignees.push({ value: row.value });
          break;
        default:
          break;
      }
    }

    return { services, roleCategories, regions, locations, taskNames, workTypes, assignees };
  }

  private buildOverviewFacetWhereClause(params: {
    snapshotId: number;
    filters: AnalyticsFilters;
    queryOptions?: AnalyticsQueryOptions;
    excludeFacet: OverviewFacetFilterKey;
    includeUserFilter: boolean;
  }): Prisma.Sql {
    const { snapshotId, filters, queryOptions, excludeFacet, includeUserFilter } = params;
    const branchFilters: AnalyticsFilters = {
      ...filters,
    };

    delete branchFilters[excludeFacet];
    if (!includeUserFilter) {
      delete branchFilters.user;
    }

    const conditions: Prisma.Sql[] = [asOfSnapshotCondition(snapshotId)];
    if (includeUserFilter && excludeFacet !== 'user' && filters.user && filters.user.length > 0) {
      conditions.push(Prisma.sql`assignee IN (${Prisma.join(filters.user)})`);
    }

    return buildAnalyticsWhere(branchFilters, conditions, queryOptions);
  }

  async fetchServiceOverviewRows(snapshotId: number, filters: AnalyticsFilters): Promise<ServiceOverviewDbRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [asOfSnapshotCondition(snapshotId)]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('due_date'),
    });

    return tmPrisma.$queryRaw<ServiceOverviewDbRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          jurisdiction_label,
          assignment_state,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_open_due_daily_facts
        ${whereClause}
      )
      SELECT
        jurisdiction_label AS service,
        SUM(task_count)::int AS open_tasks,
        SUM(CASE WHEN assignment_state = 'Assigned' THEN task_count ELSE 0 END)::int AS assigned_tasks,
        SUM(CASE WHEN priority_rank = 4 THEN task_count ELSE 0 END)::int AS urgent,
        SUM(CASE WHEN priority_rank = 3 THEN task_count ELSE 0 END)::int AS high,
        SUM(CASE WHEN priority_rank = 2 THEN task_count ELSE 0 END)::int AS medium,
        SUM(CASE WHEN priority_rank = 1 THEN task_count ELSE 0 END)::int AS low
      FROM bucketed
      GROUP BY jurisdiction_label
      ORDER BY service ASC
    `);
  }

  async fetchTaskEventsByServiceRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    range: { from: Date; to: Date }
  ): Promise<TaskEventsByServiceDbRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`event_date >= ${range.from}`,
      Prisma.sql`event_date <= ${range.to}`,
    ]);

    return tmPrisma.$queryRaw<TaskEventsByServiceDbRow[]>(Prisma.sql`
      SELECT
        jurisdiction_label AS service,
        SUM(CASE WHEN event_type = 'completed' THEN task_count ELSE 0 END)::int AS completed,
        SUM(CASE WHEN event_type = 'cancelled' THEN task_count ELSE 0 END)::int AS cancelled,
        SUM(CASE WHEN event_type = 'created' THEN task_count ELSE 0 END)::int AS created
      FROM analytics.snapshot_task_event_daily_facts
      ${whereClause}
      GROUP BY jurisdiction_label
      ORDER BY service ASC
    `);
  }

  async fetchOverviewFilterOptionsRows(
    snapshotId: number,
    params?: OverviewFilterOptionsInput
  ): Promise<OverviewFilterOptionsRows> {
    const resolved = this.resolveOverviewFilterOptionsParams(params);
    const scope = resolved.scope ?? 'overview';
    const filters = resolved.filters ?? {};
    const queryOptions = resolved.queryOptions;
    const includeUserFilter = resolved.includeUserFilter ?? true;

    if (
      this.shouldUseUnfilteredUserOverviewOptionsFastPath({
        scope,
        filters,
        includeUserFilter,
      })
    ) {
      const optionRows = await tmPrisma.$queryRaw<OverviewFilterOptionRow[]>(
        this.buildUnfilteredUserOverviewFilterOptionsQuery(snapshotId, queryOptions)
      );
      return this.mapOverviewFilterOptionRows(optionRows);
    }

    const tableName = this.filterFactsTable(scope);

    const optionBranches: Prisma.Sql[] = [];
    const serviceWhere = this.buildOverviewFacetWhereClause({
      snapshotId,
      filters,
      queryOptions,
      excludeFacet: 'service',
      includeUserFilter,
    });
    optionBranches.push(Prisma.sql`
      SELECT
        'service'::text AS option_type,
        jurisdiction_label AS value
      FROM ${tableName}
      ${serviceWhere}
        AND jurisdiction_label IS NOT NULL
      GROUP BY jurisdiction_label
    `);

    const roleCategoryWhere = this.buildOverviewFacetWhereClause({
      snapshotId,
      filters,
      queryOptions,
      excludeFacet: 'roleCategory',
      includeUserFilter,
    });
    optionBranches.push(Prisma.sql`
      SELECT
        'roleCategory'::text AS option_type,
        role_category_label AS value
      FROM ${tableName}
      ${roleCategoryWhere}
        AND role_category_label IS NOT NULL
        AND BTRIM(role_category_label) <> ''
      GROUP BY role_category_label
    `);

    const regionWhere = this.buildOverviewFacetWhereClause({
      snapshotId,
      filters,
      queryOptions,
      excludeFacet: 'region',
      includeUserFilter,
    });
    optionBranches.push(Prisma.sql`
      SELECT
        'region'::text AS option_type,
        region AS value
      FROM ${tableName}
      ${regionWhere}
        AND region IS NOT NULL
      GROUP BY region
    `);

    const locationWhere = this.buildOverviewFacetWhereClause({
      snapshotId,
      filters,
      queryOptions,
      excludeFacet: 'location',
      includeUserFilter,
    });
    optionBranches.push(Prisma.sql`
      SELECT
        'location'::text AS option_type,
        location AS value
      FROM ${tableName}
      ${locationWhere}
        AND location IS NOT NULL
      GROUP BY location
    `);

    const taskNameWhere = this.buildOverviewFacetWhereClause({
      snapshotId,
      filters,
      queryOptions,
      excludeFacet: 'taskName',
      includeUserFilter,
    });
    optionBranches.push(Prisma.sql`
      SELECT
        'taskName'::text AS option_type,
        task_name AS value
      FROM ${tableName}
      ${taskNameWhere}
        AND task_name IS NOT NULL
      GROUP BY task_name
    `);

    const workTypeWhere = this.buildOverviewFacetWhereClause({
      snapshotId,
      filters,
      queryOptions,
      excludeFacet: 'workType',
      includeUserFilter,
    });
    optionBranches.push(Prisma.sql`
      SELECT
        'workType'::text AS option_type,
        work_type AS value
      FROM ${tableName}
      ${workTypeWhere}
        AND work_type IS NOT NULL
      GROUP BY work_type
    `);

    if (includeUserFilter) {
      const assigneeWhere = this.buildOverviewFacetWhereClause({
        snapshotId,
        filters,
        queryOptions,
        excludeFacet: 'user',
        includeUserFilter,
      });
      optionBranches.push(Prisma.sql`
        SELECT
          'assignee'::text AS option_type,
          assignee AS value
        FROM ${tableName}
        ${assigneeWhere}
          AND assignee IS NOT NULL
        GROUP BY assignee
      `);
    }

    const optionRows = await tmPrisma.$queryRaw<OverviewFilterOptionRow[]>(Prisma.sql`
      WITH option_rows AS (
        ${Prisma.join(optionBranches, ' UNION ALL ')}
      ),
      deduped_options AS (
        SELECT option_type, value
        FROM option_rows
        GROUP BY option_type, value
      )
      SELECT
        deduped_options.option_type,
        deduped_options.value,
        CASE
          WHEN deduped_options.option_type = 'workType'
            THEN COALESCE(work_types.label, deduped_options.value)
          ELSE deduped_options.value
        END AS text
      FROM deduped_options
      LEFT JOIN cft_task_db.work_types work_types
        ON deduped_options.option_type = 'workType'
       AND work_types.work_type_id = deduped_options.value
      ORDER BY deduped_options.option_type ASC, text ASC, deduped_options.value ASC
    `);

    return this.mapOverviewFilterOptionRows(optionRows);
  }

  async fetchOpenTasksCreatedByAssignmentRows(snapshotId: number, filters: AnalyticsFilters): Promise<AssignmentRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'created'`,
      Prisma.sql`task_status = 'open'`,
    ]);

    return tmPrisma.$queryRaw<AssignmentRow[]>(Prisma.sql`
      SELECT
        to_char(reference_date, 'YYYY-MM-DD') AS date_key,
        assignment_state,
        SUM(task_count)::int AS total
      FROM analytics.snapshot_task_daily_facts
      ${whereClause}
      GROUP BY reference_date, assignment_state
      ORDER BY reference_date
    `);
  }

  async fetchOpenTasksByNameRows(snapshotId: number, filters: AnalyticsFilters): Promise<OpenTasksByNameRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [asOfSnapshotCondition(snapshotId)]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('due_date'),
    });

    return tmPrisma.$queryRaw<OpenTasksByNameRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          task_name,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_open_due_daily_facts
        ${whereClause}
      )
      SELECT
        task_name,
        SUM(CASE WHEN priority_rank = 4 THEN task_count ELSE 0 END)::int AS urgent,
        SUM(CASE WHEN priority_rank = 3 THEN task_count ELSE 0 END)::int AS high,
        SUM(CASE WHEN priority_rank = 2 THEN task_count ELSE 0 END)::int AS medium,
        SUM(CASE WHEN priority_rank = 1 THEN task_count ELSE 0 END)::int AS low
      FROM bucketed
      GROUP BY task_name
      ORDER BY task_name ASC
    `);
  }

  async fetchOpenTasksByRegionLocationRows(
    snapshotId: number,
    filters: AnalyticsFilters
  ): Promise<OpenTasksByRegionLocationRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [asOfSnapshotCondition(snapshotId)]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('due_date'),
    });

    return tmPrisma.$queryRaw<OpenTasksByRegionLocationRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          region,
          location,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_open_due_daily_facts
        ${whereClause}
      )
      SELECT
        region,
        location,
        SUM(task_count)::int AS open_tasks,
        SUM(CASE WHEN priority_rank = 4 THEN task_count ELSE 0 END)::int AS urgent,
        SUM(CASE WHEN priority_rank = 3 THEN task_count ELSE 0 END)::int AS high,
        SUM(CASE WHEN priority_rank = 2 THEN task_count ELSE 0 END)::int AS medium,
        SUM(CASE WHEN priority_rank = 1 THEN task_count ELSE 0 END)::int AS low
      FROM bucketed
      GROUP BY region, location
      ORDER BY location ASC, region ASC
    `);
  }

  async fetchOpenTasksSummaryRows(snapshotId: number, filters: AnalyticsFilters): Promise<SummaryTotalsRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [asOfSnapshotCondition(snapshotId)]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('due_date'),
    });

    return tmPrisma.$queryRaw<SummaryTotalsRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          assignment_state,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_open_due_daily_facts
        ${whereClause}
      )
      SELECT
        SUM(CASE WHEN assignment_state = 'Assigned' THEN task_count ELSE 0 END)::int AS assigned,
        SUM(CASE WHEN assignment_state = 'Assigned' THEN 0 ELSE task_count END)::int AS unassigned,
        SUM(CASE WHEN priority_rank = 4 THEN task_count ELSE 0 END)::int AS urgent,
        SUM(CASE WHEN priority_rank = 3 THEN task_count ELSE 0 END)::int AS high,
        SUM(CASE WHEN priority_rank = 2 THEN task_count ELSE 0 END)::int AS medium,
        SUM(CASE WHEN priority_rank = 1 THEN task_count ELSE 0 END)::int AS low
      FROM bucketed
    `);
  }

  async fetchTasksDuePriorityRows(snapshotId: number, filters: AnalyticsFilters): Promise<TasksDuePriorityRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [asOfSnapshotCondition(snapshotId)]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('due_date'),
    });

    return tmPrisma.$queryRaw<TasksDuePriorityRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          due_date,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_open_due_daily_facts
        ${whereClause}
      )
      SELECT
        to_char(due_date, 'YYYY-MM-DD') AS date_key,
        SUM(CASE WHEN priority_rank = 4 THEN task_count ELSE 0 END)::int AS urgent,
        SUM(CASE WHEN priority_rank = 3 THEN task_count ELSE 0 END)::int AS high,
        SUM(CASE WHEN priority_rank = 2 THEN task_count ELSE 0 END)::int AS medium,
        SUM(CASE WHEN priority_rank = 1 THEN task_count ELSE 0 END)::int AS low
      FROM bucketed
      GROUP BY due_date
      ORDER BY due_date
    `);
  }

  async fetchCompletedSummaryRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    range?: { from?: Date; to?: Date },
    queryOptions?: AnalyticsQueryOptions
  ): Promise<CompletedSummaryRow[]> {
    const conditions: Prisma.Sql[] = [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'completed'`,
      Prisma.sql`task_status = 'completed'`,
    ];
    if (range?.from) {
      conditions.push(Prisma.sql`reference_date >= ${range.from}`);
    }
    if (range?.to) {
      conditions.push(Prisma.sql`reference_date <= ${range.to}`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions, queryOptions);

    return tmPrisma.$queryRaw<CompletedSummaryRow[]>(Prisma.sql`
      SELECT
        SUM(task_count)::int AS total,
        SUM(CASE WHEN sla_flag IS TRUE THEN task_count ELSE 0 END)::int AS within
      FROM analytics.snapshot_task_daily_facts
      ${whereClause}
    `);
  }

  async fetchUserOverviewCompletedSummaryRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<CompletedSummaryRow[]> {
    const whereClause = buildUserOverviewCompletedFactsWhere(snapshotId, filters, queryOptions);

    return tmPrisma.$queryRaw<CompletedSummaryRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(tasks), 0)::int AS total,
        COALESCE(SUM(within_due), 0)::int AS within
      FROM analytics.snapshot_user_completed_facts
      ${whereClause}
    `);
  }

  async fetchUserOverviewAssignedSummaryRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<UserOverviewAssignedSummaryRow[]> {
    if (filters.user && filters.user.length > 0) {
      const conditions: Prisma.Sql[] = [asOfSnapshotCondition(snapshotId), Prisma.sql`state = 'ASSIGNED'`];
      conditions.push(Prisma.sql`assignee IN (${Prisma.join(filters.user)})`);
      const whereClause = buildAnalyticsWhere(filters, conditions, queryOptions);
      const priorityRank = priorityRankSql({
        priorityColumn: Prisma.raw('major_priority'),
        dateColumn: Prisma.raw('due_date'),
      });

      return tmPrisma.$queryRaw<UserOverviewAssignedSummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(CASE WHEN ${priorityRank} = 4 THEN 1 ELSE 0 END), 0)::int AS urgent,
          COALESCE(SUM(CASE WHEN ${priorityRank} = 3 THEN 1 ELSE 0 END), 0)::int AS high,
          COALESCE(SUM(CASE WHEN ${priorityRank} = 2 THEN 1 ELSE 0 END), 0)::int AS medium,
          COALESCE(SUM(CASE WHEN ${priorityRank} = 1 THEN 1 ELSE 0 END), 0)::int AS low
        FROM analytics.snapshot_open_task_rows rows
        ${whereClause}
      `);
    }

    const conditions: Prisma.Sql[] = [asOfSnapshotCondition(snapshotId), Prisma.sql`assignment_state = 'Assigned'`];
    const whereClause = buildAnalyticsWhere(filters, conditions, queryOptions);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('due_date'),
    });

    return tmPrisma.$queryRaw<UserOverviewAssignedSummaryRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_open_due_daily_facts
        ${whereClause}
      )
      SELECT
        COALESCE(SUM(task_count), 0)::int AS total,
        COALESCE(SUM(CASE WHEN priority_rank = 4 THEN task_count ELSE 0 END), 0)::int AS urgent,
        COALESCE(SUM(CASE WHEN priority_rank = 3 THEN task_count ELSE 0 END), 0)::int AS high,
        COALESCE(SUM(CASE WHEN priority_rank = 2 THEN task_count ELSE 0 END), 0)::int AS medium,
        COALESCE(SUM(CASE WHEN priority_rank = 1 THEN task_count ELSE 0 END), 0)::int AS low
      FROM bucketed
    `);
  }

  async fetchUserOverviewCompletedTaskCount(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<number> {
    const whereClause = buildUserOverviewCompletedFactsWhere(snapshotId, filters, queryOptions);

    const rows = await tmPrisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(tasks), 0)::int AS total
      FROM analytics.snapshot_user_completed_facts
      ${whereClause}
    `);
    return rows[0]?.total ?? 0;
  }

  async fetchCompletedTimelineRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    range?: { from?: Date; to?: Date }
  ): Promise<CompletedTimelineRow[]> {
    const conditions: Prisma.Sql[] = [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'completed'`,
      Prisma.sql`task_status = 'completed'`,
    ];
    if (range?.from) {
      conditions.push(Prisma.sql`reference_date >= ${range.from}`);
    }
    if (range?.to) {
      conditions.push(Prisma.sql`reference_date <= ${range.to}`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions);

    return tmPrisma.$queryRaw<CompletedTimelineRow[]>(Prisma.sql`
      SELECT
        to_char(reference_date, 'YYYY-MM-DD') AS date_key,
        SUM(task_count)::int AS total,
        SUM(CASE WHEN sla_flag IS TRUE THEN task_count ELSE 0 END)::int AS within
      FROM analytics.snapshot_task_daily_facts
      ${whereClause}
      GROUP BY reference_date
      ORDER BY reference_date
    `);
  }

  async fetchCompletedProcessingHandlingTimeRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    range?: { from?: Date; to?: Date }
  ): Promise<CompletedProcessingHandlingTimeRow[]> {
    const conditions: Prisma.Sql[] = [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'completed'`,
      Prisma.sql`task_status = 'completed'`,
    ];
    if (range?.from) {
      conditions.push(Prisma.sql`reference_date >= ${range.from}`);
    }
    if (range?.to) {
      conditions.push(Prisma.sql`reference_date <= ${range.to}`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions);

    return tmPrisma.$queryRaw<CompletedProcessingHandlingTimeRow[]>(Prisma.sql`
      SELECT
        to_char(reference_date, 'YYYY-MM-DD') AS date_key,
        SUM(task_count)::int AS task_count,
        CASE
          WHEN SUM(handling_time_days_count) = 0 THEN NULL
          ELSE SUM(handling_time_days_sum)::double precision / SUM(handling_time_days_count)::double precision
        END AS handling_avg,
        CASE
          WHEN SUM(handling_time_days_count) = 0 THEN NULL
          ELSE SQRT(
            GREATEST(
              0,
              (SUM(handling_time_days_sum_squares)::double precision / SUM(handling_time_days_count)::double precision) -
              POWER(SUM(handling_time_days_sum)::double precision / SUM(handling_time_days_count)::double precision, 2)
            )
          )
        END AS handling_stddev,
        SUM(handling_time_days_sum)::double precision AS handling_sum,
        SUM(handling_time_days_count)::int AS handling_count,
        CASE
          WHEN SUM(processing_time_days_count) = 0 THEN NULL
          ELSE SUM(processing_time_days_sum)::double precision / SUM(processing_time_days_count)::double precision
        END AS processing_avg,
        CASE
          WHEN SUM(processing_time_days_count) = 0 THEN NULL
          ELSE SQRT(
            GREATEST(
              0,
              (SUM(processing_time_days_sum_squares)::double precision / SUM(processing_time_days_count)::double precision) -
              POWER(SUM(processing_time_days_sum)::double precision / SUM(processing_time_days_count)::double precision, 2)
            )
          )
        END AS processing_stddev,
        SUM(processing_time_days_sum)::double precision AS processing_sum,
        SUM(processing_time_days_count)::int AS processing_count
      FROM analytics.snapshot_task_daily_facts
      ${whereClause}
      GROUP BY reference_date
      ORDER BY reference_date
    `);
  }

  async fetchCompletedByNameRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    range?: { from?: Date; to?: Date }
  ): Promise<CompletedByNameRow[]> {
    const conditions: Prisma.Sql[] = [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'completed'`,
      Prisma.sql`task_status = 'completed'`,
    ];
    if (range?.from) {
      conditions.push(Prisma.sql`reference_date >= ${range.from}`);
    }
    if (range?.to) {
      conditions.push(Prisma.sql`reference_date <= ${range.to}`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions);

    return tmPrisma.$queryRaw<CompletedByNameRow[]>(Prisma.sql`
      SELECT
        task_name,
        SUM(task_count)::int AS total,
        SUM(CASE WHEN sla_flag IS TRUE THEN task_count ELSE 0 END)::int AS within
      FROM analytics.snapshot_task_daily_facts
      ${whereClause}
      GROUP BY task_name
      ORDER BY total DESC
    `);
  }

  async fetchCompletedByLocationRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    range?: { from?: Date; to?: Date }
  ): Promise<CompletedByLocationRow[]> {
    const conditions: Prisma.Sql[] = [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'completed'`,
      Prisma.sql`task_status = 'completed'`,
    ];
    if (range?.from) {
      conditions.push(Prisma.sql`reference_date >= ${range.from}`);
    }
    if (range?.to) {
      conditions.push(Prisma.sql`reference_date <= ${range.to}`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions);

    return tmPrisma.$queryRaw<CompletedByLocationRow[]>(Prisma.sql`
      SELECT
        location,
        region,
        SUM(task_count)::int AS total,
        SUM(CASE WHEN sla_flag IS TRUE THEN task_count ELSE 0 END)::int AS within,
        SUM(handling_time_days_sum)::double precision AS handling_time_days_sum,
        SUM(handling_time_days_count)::int AS handling_time_days_count,
        SUM(processing_time_days_sum)::double precision AS processing_time_days_sum,
        SUM(processing_time_days_count)::int AS processing_time_days_count
      FROM analytics.snapshot_task_daily_facts
      ${whereClause}
      GROUP BY location, region
      ORDER BY location ASC, region ASC
    `);
  }

  async fetchCompletedByRegionRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    range?: { from?: Date; to?: Date }
  ): Promise<CompletedByRegionRow[]> {
    const conditions: Prisma.Sql[] = [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'completed'`,
      Prisma.sql`task_status = 'completed'`,
    ];
    if (range?.from) {
      conditions.push(Prisma.sql`reference_date >= ${range.from}`);
    }
    if (range?.to) {
      conditions.push(Prisma.sql`reference_date <= ${range.to}`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions);

    return tmPrisma.$queryRaw<CompletedByRegionRow[]>(Prisma.sql`
      SELECT
        region,
        SUM(task_count)::int AS total,
        SUM(CASE WHEN sla_flag IS TRUE THEN task_count ELSE 0 END)::int AS within,
        SUM(handling_time_days_sum)::double precision AS handling_time_days_sum,
        SUM(handling_time_days_count)::int AS handling_time_days_count,
        SUM(processing_time_days_sum)::double precision AS processing_time_days_sum,
        SUM(processing_time_days_count)::int AS processing_time_days_count
      FROM analytics.snapshot_task_daily_facts
      ${whereClause}
      GROUP BY region
      ORDER BY region ASC
    `);
  }
}

export const taskFactsRepository = new TaskFactsRepository();
