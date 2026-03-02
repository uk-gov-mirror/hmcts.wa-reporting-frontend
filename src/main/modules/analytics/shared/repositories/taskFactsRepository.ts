import { Prisma } from '@prisma/client';

import { tmPrisma } from '../data/prisma';
import { priorityRankSql } from '../priority/priorityRankSql';
import { AnalyticsFilters } from '../types';

import { SECONDS_PER_DAY_SQL } from './constants';
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
  filters?: AnalyticsFilters;
  queryOptions?: AnalyticsQueryOptions;
  includeUserFilter?: boolean;
};

type OverviewFilterOptionsInput = OverviewFilterOptionsParams | AnalyticsQueryOptions | undefined;

export class TaskFactsRepository {
  private resolveOverviewFilterOptionsParams(params: OverviewFilterOptionsInput): OverviewFilterOptionsParams {
    if (!params) {
      return {};
    }
    if ('filters' in params || 'queryOptions' in params || 'includeUserFilter' in params) {
      return params as OverviewFilterOptionsParams;
    }
    return { queryOptions: params as AnalyticsQueryOptions };
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
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'due'`,
      Prisma.sql`task_status = 'open'`,
    ]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('reference_date'),
    });

    return tmPrisma.$queryRaw<ServiceOverviewDbRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          jurisdiction_label,
          assignment_state,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_task_daily_facts
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
      Prisma.sql`reference_date >= ${range.from}`,
      Prisma.sql`reference_date <= ${range.to}`,
      Prisma.sql`date_role IN ('created', 'completed', 'cancelled')`,
    ]);

    return tmPrisma.$queryRaw<TaskEventsByServiceDbRow[]>(Prisma.sql`
      SELECT
        jurisdiction_label AS service,
        SUM(CASE WHEN date_role = 'completed' THEN task_count ELSE 0 END)::int AS completed,
        SUM(CASE WHEN date_role = 'cancelled' THEN task_count ELSE 0 END)::int AS cancelled,
        SUM(CASE WHEN date_role = 'created' THEN task_count ELSE 0 END)::int AS created
      FROM analytics.snapshot_task_daily_facts
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
    const filters = resolved.filters ?? {};
    const queryOptions = resolved.queryOptions;
    const includeUserFilter = resolved.includeUserFilter ?? true;

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
      FROM analytics.snapshot_filter_facet_facts
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
      FROM analytics.snapshot_filter_facet_facts
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
      FROM analytics.snapshot_filter_facet_facts
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
      FROM analytics.snapshot_filter_facet_facts
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
      FROM analytics.snapshot_filter_facet_facts
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
      FROM analytics.snapshot_filter_facet_facts
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
        FROM analytics.snapshot_filter_facet_facts
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
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'due'`,
      Prisma.sql`task_status = 'open'`,
    ]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('reference_date'),
    });

    return tmPrisma.$queryRaw<OpenTasksByNameRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          task_name,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_task_daily_facts
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
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'due'`,
      Prisma.sql`task_status = 'open'`,
    ]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('reference_date'),
    });

    return tmPrisma.$queryRaw<OpenTasksByRegionLocationRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          region,
          location,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_task_daily_facts
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
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'due'`,
      Prisma.sql`task_status = 'open'`,
    ]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('reference_date'),
    });

    return tmPrisma.$queryRaw<SummaryTotalsRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          assignment_state,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_task_daily_facts
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
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'due'`,
      Prisma.sql`task_status = 'open'`,
    ]);
    const priorityRank = priorityRankSql({
      priorityColumn: Prisma.raw('priority'),
      dateColumn: Prisma.raw('reference_date'),
    });

    return tmPrisma.$queryRaw<TasksDuePriorityRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          reference_date,
          task_count,
          ${priorityRank} AS priority_rank
        FROM analytics.snapshot_task_daily_facts
        ${whereClause}
      )
      SELECT
        to_char(reference_date, 'YYYY-MM-DD') AS date_key,
        SUM(CASE WHEN priority_rank = 4 THEN task_count ELSE 0 END)::int AS urgent,
        SUM(CASE WHEN priority_rank = 3 THEN task_count ELSE 0 END)::int AS high,
        SUM(CASE WHEN priority_rank = 2 THEN task_count ELSE 0 END)::int AS medium,
        SUM(CASE WHEN priority_rank = 1 THEN task_count ELSE 0 END)::int AS low
      FROM bucketed
      GROUP BY reference_date
      ORDER BY reference_date
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

  async fetchUserOverviewCompletedTaskCount(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<number> {
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
    const whereClause = buildAnalyticsWhere(filters, conditions, queryOptions);

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
      Prisma.sql`LOWER(termination_reason) = 'completed'`,
      Prisma.sql`completed_date IS NOT NULL`,
    ];
    if (range?.from) {
      conditions.push(Prisma.sql`completed_date >= ${range.from}`);
    }
    if (range?.to) {
      conditions.push(Prisma.sql`completed_date <= ${range.to}`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions);

    return tmPrisma.$queryRaw<CompletedProcessingHandlingTimeRow[]>(Prisma.sql`
      SELECT
        to_char(completed_date, 'YYYY-MM-DD') AS date_key,
        COUNT(*)::int AS task_count,
        AVG(EXTRACT(EPOCH FROM handling_time) / ${SECONDS_PER_DAY_SQL}) FILTER (WHERE handling_time IS NOT NULL)::double precision AS handling_avg,
        STDDEV_POP(EXTRACT(EPOCH FROM handling_time) / ${SECONDS_PER_DAY_SQL}) FILTER (WHERE handling_time IS NOT NULL)::double precision AS handling_stddev,
        SUM(EXTRACT(EPOCH FROM handling_time) / ${SECONDS_PER_DAY_SQL}) FILTER (WHERE handling_time IS NOT NULL)::double precision AS handling_sum,
        COUNT(handling_time)::int AS handling_count,
        AVG(EXTRACT(EPOCH FROM processing_time) / ${SECONDS_PER_DAY_SQL}) FILTER (WHERE processing_time IS NOT NULL)::double precision AS processing_avg,
        STDDEV_POP(EXTRACT(EPOCH FROM processing_time) / ${SECONDS_PER_DAY_SQL}) FILTER (WHERE processing_time IS NOT NULL)::double precision AS processing_stddev,
        SUM(EXTRACT(EPOCH FROM processing_time) / ${SECONDS_PER_DAY_SQL}) FILTER (WHERE processing_time IS NOT NULL)::double precision AS processing_sum,
        COUNT(processing_time)::int AS processing_count
      FROM analytics.snapshot_task_rows
      ${whereClause}
      GROUP BY completed_date
      ORDER BY completed_date
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
