import { Prisma } from '@prisma/client';

import { tmPrisma } from '../data/prisma';
import { CriticalTasksSortBy } from '../outstandingSort';
import { MAX_PAGINATION_RESULTS, getMaxPaginationPage, normalisePage } from '../pagination';
import { priorityRankSql } from '../priority/priorityRankSql';
import { AnalyticsFilters } from '../types';
import { AssignedSortBy, CompletedSortBy, SortDirection, SortState } from '../userOverviewSort';

import { SECONDS_PER_DAY_SQL } from './constants';
import { AnalyticsQueryOptions, buildAnalyticsWhere } from './filters';
import { asOfSnapshotCondition } from './snapshotSql';
import {
  CompletedTaskAuditRow,
  FilterValueRow,
  OutstandingCriticalTaskRow,
  TasksDueRow,
  UserOverviewCompletedByDateRow,
  UserOverviewCompletedByTaskNameRow,
  UserOverviewTaskRow,
  WaitTimeRow,
} from './types';

type PaginationOptions = {
  page: number;
  pageSize: number;
};

const WITHIN_DUE_SORT_SQL = Prisma.sql`within_due_sort_value`;

function buildPriorityRank(): Prisma.Sql {
  return priorityRankSql({
    priorityColumn: Prisma.raw('major_priority'),
    dateColumn: Prisma.raw('due_date'),
  });
}

function applyCompletedDateFilters(filters: AnalyticsFilters, conditions: Prisma.Sql[]): void {
  if (filters.completedFrom) {
    conditions.push(Prisma.sql`completed_date >= ${filters.completedFrom}`);
  }
  if (filters.completedTo) {
    conditions.push(Prisma.sql`completed_date <= ${filters.completedTo}`);
  }
}

function buildCompletedTaskConditions(filters: AnalyticsFilters, caseId?: string): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [Prisma.sql`LOWER(termination_reason) = 'completed'`];
  applyCompletedDateFilters(filters, conditions);
  if (caseId) {
    conditions.push(Prisma.sql`case_id = ${caseId}`);
  }
  return conditions;
}

function buildPaginationClauses(pagination?: PaginationOptions | null): {
  limitClause: Prisma.Sql;
  offsetClause: Prisma.Sql;
} {
  if (!pagination) {
    return { limitClause: Prisma.empty, offsetClause: Prisma.empty };
  }
  const pageSize = Number.isFinite(pagination.pageSize)
    ? Math.min(Math.max(Math.floor(pagination.pageSize), 1), MAX_PAGINATION_RESULTS)
    : 1;
  const maxPage = getMaxPaginationPage(pageSize);
  const page = normalisePage(pagination.page, maxPage);
  const offset = (page - 1) * pageSize;
  return {
    limitClause: Prisma.sql`LIMIT ${pageSize}`,
    offsetClause: Prisma.sql`OFFSET ${offset}`,
  };
}

function buildUserOverviewTaskQuery(
  whereClause: Prisma.Sql,
  orderBy: Prisma.Sql,
  pagination?: PaginationOptions | null
): Prisma.Sql {
  const priorityRank = buildPriorityRank();
  const { limitClause, offsetClause } = buildPaginationClauses(pagination);

  return Prisma.sql`
    SELECT
      case_id,
      task_id,
      task_name,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      to_char(created_date, 'YYYY-MM-DD') AS created_date,
      to_char(first_assigned_date, 'YYYY-MM-DD') AS first_assigned_date,
      to_char(due_date, 'YYYY-MM-DD') AS due_date,
      to_char(completed_date, 'YYYY-MM-DD') AS completed_date,
      (EXTRACT(EPOCH FROM handling_time) / ${SECONDS_PER_DAY_SQL})::double precision AS handling_time_days,
      is_within_sla,
      ${priorityRank} AS priority_rank,
      assignee,
      number_of_reassignments
    FROM analytics.snapshot_task_rows
    ${whereClause}
    ORDER BY ${orderBy}
    ${limitClause}
    ${offsetClause}
  `;
}

function directionSql(direction: SortDirection): Prisma.Sql {
  return Prisma.raw(direction === 'asc' ? 'ASC' : 'DESC');
}

function buildAssignedOrderBy(sort: SortState<AssignedSortBy>): Prisma.Sql {
  const column = (() => {
    switch (sort.by) {
      case 'caseId':
        return Prisma.sql`case_id`;
      case 'createdDate':
        return Prisma.raw('analytics.snapshot_task_rows.created_date');
      case 'taskName':
        return Prisma.sql`task_name`;
      case 'assignedDate':
        return Prisma.raw('analytics.snapshot_task_rows.first_assigned_date');
      case 'dueDate':
        return Prisma.raw('analytics.snapshot_task_rows.due_date');
      case 'priority':
        return buildPriorityRank();
      case 'totalAssignments':
        return Prisma.sql`COALESCE(number_of_reassignments, 0) + 1`;
      case 'assignee':
        return Prisma.sql`assignee`;
      case 'location':
        return Prisma.sql`location`;
      default:
        return Prisma.raw('analytics.snapshot_task_rows.created_date');
    }
  })();

  return Prisma.sql`${column} ${directionSql(sort.dir)} NULLS LAST`;
}

function buildCompletedOrderBy(sort: SortState<CompletedSortBy>): Prisma.Sql {
  const column = (() => {
    switch (sort.by) {
      case 'caseId':
        return Prisma.sql`case_id`;
      case 'createdDate':
        return Prisma.raw('analytics.snapshot_task_rows.created_date');
      case 'taskName':
        return Prisma.sql`task_name`;
      case 'assignedDate':
        return Prisma.raw('analytics.snapshot_task_rows.first_assigned_date');
      case 'dueDate':
        return Prisma.raw('analytics.snapshot_task_rows.due_date');
      case 'completedDate':
        return Prisma.raw('analytics.snapshot_task_rows.completed_date');
      case 'handlingTimeDays':
        return Prisma.sql`EXTRACT(EPOCH FROM handling_time) / ${SECONDS_PER_DAY_SQL}`;
      case 'withinDue':
        return WITHIN_DUE_SORT_SQL;
      case 'totalAssignments':
        return Prisma.sql`COALESCE(number_of_reassignments, 0) + 1`;
      case 'assignee':
        return Prisma.sql`assignee`;
      case 'location':
        return Prisma.sql`location`;
      default:
        return Prisma.raw('analytics.snapshot_task_rows.completed_date');
    }
  })();

  return Prisma.sql`${column} ${directionSql(sort.dir)} NULLS LAST`;
}

function buildCriticalTasksOrderBy(sort: SortState<CriticalTasksSortBy>): Prisma.Sql {
  const column = (() => {
    switch (sort.by) {
      case 'caseId':
        return Prisma.sql`case_id`;
      case 'caseType':
        return Prisma.sql`case_type_label`;
      case 'location':
        return Prisma.sql`location`;
      case 'taskName':
        return Prisma.sql`task_name`;
      case 'createdDate':
        return Prisma.raw('analytics.snapshot_task_rows.created_date');
      case 'dueDate':
        return Prisma.raw('analytics.snapshot_task_rows.due_date');
      case 'priority':
        return priorityRankSql({
          priorityColumn: Prisma.raw('analytics.snapshot_task_rows.major_priority'),
          dateColumn: Prisma.raw('analytics.snapshot_task_rows.due_date'),
        });
      case 'agentName':
        return Prisma.sql`assignee`;
      default:
        return Prisma.raw('analytics.snapshot_task_rows.due_date');
    }
  })();

  return Prisma.sql`${column} ${directionSql(sort.dir)} NULLS LAST`;
}

function buildUserOverviewWhere(
  snapshotId: number,
  filters: AnalyticsFilters,
  baseConditions: Prisma.Sql[],
  queryOptions?: AnalyticsQueryOptions
): Prisma.Sql {
  const whereClause = buildAnalyticsWhere(
    filters,
    [asOfSnapshotCondition(snapshotId), ...baseConditions],
    queryOptions
  );
  if (!filters.user || filters.user.length === 0) {
    return whereClause;
  }
  const userCondition = Prisma.sql`assignee IN (${Prisma.join(filters.user)})`;
  if (whereClause.sql) {
    return Prisma.sql`${whereClause} AND ${userCondition}`;
  }
  return Prisma.sql`WHERE ${userCondition}`;
}

export class TaskThinRepository {
  async fetchUserOverviewAssignedTaskRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    sort: SortState<AssignedSortBy>,
    pagination?: PaginationOptions | null,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<UserOverviewTaskRow[]> {
    const whereClause = buildUserOverviewWhere(snapshotId, filters, [Prisma.sql`state = 'ASSIGNED'`], queryOptions);
    const orderBy = buildAssignedOrderBy(sort);

    return tmPrisma.$queryRaw<UserOverviewTaskRow[]>(buildUserOverviewTaskQuery(whereClause, orderBy, pagination));
  }

  async fetchUserOverviewCompletedTaskRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    sort: SortState<CompletedSortBy>,
    pagination?: PaginationOptions | null,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<UserOverviewTaskRow[]> {
    const conditions = buildCompletedTaskConditions(filters);
    const whereClause = buildUserOverviewWhere(snapshotId, filters, conditions, queryOptions);
    const orderBy = buildCompletedOrderBy(sort);

    return tmPrisma.$queryRaw<UserOverviewTaskRow[]>(buildUserOverviewTaskQuery(whereClause, orderBy, pagination));
  }

  async fetchUserOverviewAssignedTaskCount(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<number> {
    const whereClause = buildUserOverviewWhere(snapshotId, filters, [Prisma.sql`state = 'ASSIGNED'`], queryOptions);
    const rows = await tmPrisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM analytics.snapshot_task_rows
      ${whereClause}
    `);
    return rows[0]?.total ?? 0;
  }

  async fetchUserOverviewCompletedTaskCount(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<number> {
    const conditions = buildCompletedTaskConditions(filters);
    const whereClause = buildUserOverviewWhere(snapshotId, filters, conditions, queryOptions);
    const rows = await tmPrisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM analytics.snapshot_task_rows
      ${whereClause}
    `);
    return rows[0]?.total ?? 0;
  }

  async fetchUserOverviewCompletedByDateRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<UserOverviewCompletedByDateRow[]> {
    const conditions: Prisma.Sql[] = [asOfSnapshotCondition(snapshotId), Prisma.sql`completed_date IS NOT NULL`];
    applyCompletedDateFilters(filters, conditions);
    if (filters.user && filters.user.length > 0) {
      conditions.push(Prisma.sql`assignee IN (${Prisma.join(filters.user)})`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions, queryOptions);

    return tmPrisma.$queryRaw<UserOverviewCompletedByDateRow[]>(Prisma.sql`
      SELECT
        to_char(completed_date, 'YYYY-MM-DD') AS date_key,
        SUM(tasks)::int AS tasks,
        SUM(within_due)::int AS within_due,
        SUM(beyond_due)::int AS beyond_due,
        SUM(handling_time_sum)::numeric AS handling_time_sum,
        SUM(handling_time_count)::int AS handling_time_count
      FROM analytics.snapshot_user_completed_facts
      ${whereClause}
      GROUP BY completed_date
      ORDER BY completed_date
    `);
  }

  async fetchUserOverviewCompletedByTaskNameRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions?: AnalyticsQueryOptions
  ): Promise<UserOverviewCompletedByTaskNameRow[]> {
    const conditions: Prisma.Sql[] = [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`completed_date IS NOT NULL`,
      Prisma.sql`LOWER(termination_reason) = 'completed'`,
    ];
    applyCompletedDateFilters(filters, conditions);
    if (filters.user && filters.user.length > 0) {
      conditions.push(Prisma.sql`assignee IN (${Prisma.join(filters.user)})`);
    }
    const whereClause = buildAnalyticsWhere(filters, conditions, queryOptions);

    return tmPrisma.$queryRaw<UserOverviewCompletedByTaskNameRow[]>(Prisma.sql`
      SELECT
        task_name,
        COUNT(*)::int AS tasks,
        SUM(COALESCE(EXTRACT(EPOCH FROM handling_time) / ${SECONDS_PER_DAY_SQL}, 0))::double precision AS handling_time_sum,
        COUNT(*)::int AS handling_time_count,
        SUM(
          COALESCE(EXTRACT(EPOCH FROM due_date_to_completed_diff_time) / ${SECONDS_PER_DAY_SQL}, 0) * -1
        )::double precision AS days_beyond_sum,
        COUNT(*)::int AS days_beyond_count
      FROM analytics.snapshot_task_rows
      ${whereClause}
      GROUP BY task_name
      ORDER BY tasks DESC NULLS LAST, task_name ASC
    `);
  }

  async fetchCompletedTaskAuditRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    caseId?: string
  ): Promise<CompletedTaskAuditRow[]> {
    const conditions = [asOfSnapshotCondition(snapshotId), ...buildCompletedTaskConditions(filters, caseId)];
    const whereClause = buildAnalyticsWhere(filters, conditions);

    return tmPrisma.$queryRaw<CompletedTaskAuditRow[]>(Prisma.sql`
      SELECT
        case_id,
        task_name,
        assignee,
        to_char(completed_date, 'YYYY-MM-DD') AS completed_date,
        number_of_reassignments,
        location,
        termination_process_label,
        outcome
      FROM analytics.snapshot_task_rows
      ${whereClause}
      ORDER BY completed_date DESC NULLS LAST
    `);
  }

  async fetchOutstandingCriticalTaskRows(
    snapshotId: number,
    filters: AnalyticsFilters,
    sort: SortState<CriticalTasksSortBy>,
    pagination: PaginationOptions
  ): Promise<OutstandingCriticalTaskRow[]> {
    const priorityRank = buildPriorityRank();
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`state NOT IN ('COMPLETED', 'TERMINATED')`,
    ]);
    const orderBy = buildCriticalTasksOrderBy(sort);
    const { limitClause, offsetClause } = buildPaginationClauses(pagination);

    return tmPrisma.$queryRaw<OutstandingCriticalTaskRow[]>(Prisma.sql`
      SELECT
        case_id,
        task_id,
        task_name,
        case_type_label,
        region,
        location,
        to_char(created_date, 'YYYY-MM-DD') AS created_date,
        to_char(due_date, 'YYYY-MM-DD') AS due_date,
        ${priorityRank} AS priority_rank,
        assignee
      FROM analytics.snapshot_task_rows
      ${whereClause}
      ORDER BY ${orderBy}
      ${limitClause}
      ${offsetClause}
    `);
  }

  async fetchOutstandingCriticalTaskCount(snapshotId: number, filters: AnalyticsFilters): Promise<number> {
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`state NOT IN ('COMPLETED', 'TERMINATED')`,
    ]);
    const rows = await tmPrisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM analytics.snapshot_task_rows
      ${whereClause}
    `);
    return rows[0]?.total ?? 0;
  }

  async fetchWaitTimeByAssignedDateRows(snapshotId: number, filters: AnalyticsFilters): Promise<WaitTimeRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [asOfSnapshotCondition(snapshotId)]);

    return tmPrisma.$queryRaw<WaitTimeRow[]>(Prisma.sql`
      SELECT
        to_char(reference_date, 'YYYY-MM-DD') AS date_key,
        CASE
          WHEN SUM(assigned_task_count) = 0 THEN 0
          ELSE (EXTRACT(EPOCH FROM SUM(total_wait_time)) / ${SECONDS_PER_DAY_SQL}) / SUM(assigned_task_count)::double precision
        END::double precision AS avg_wait_time_days,
        SUM(assigned_task_count)::int AS assigned_task_count
      FROM analytics.snapshot_wait_time_by_assigned_date
      ${whereClause}
      GROUP BY reference_date
      ORDER BY reference_date
    `);
  }

  async fetchTasksDueByDateRows(snapshotId: number, filters: AnalyticsFilters): Promise<TasksDueRow[]> {
    const whereClause = buildAnalyticsWhere(filters, [
      asOfSnapshotCondition(snapshotId),
      Prisma.sql`date_role = 'due'`,
    ]);

    return tmPrisma.$queryRaw<TasksDueRow[]>(Prisma.sql`
      SELECT
        to_char(reference_date, 'YYYY-MM-DD') AS date_key,
        SUM(
          CASE
            WHEN task_status = 'open' THEN task_count
            ELSE 0
          END
        )::int AS open,
        SUM(
          CASE
            WHEN task_status = 'completed' THEN task_count
            ELSE 0
          END
        )::int AS completed
      FROM analytics.snapshot_task_daily_facts
      ${whereClause}
      GROUP BY reference_date
      ORDER BY reference_date
    `);
  }

  async fetchAssigneeIds(snapshotId: number): Promise<string[]> {
    const rows = await tmPrisma.$queryRaw<FilterValueRow[]>(Prisma.sql`
      SELECT DISTINCT assignee AS value
      FROM analytics.snapshot_task_rows
      WHERE ${asOfSnapshotCondition(snapshotId)}
        AND assignee IS NOT NULL
      ORDER BY value
    `);

    return rows.map(row => row.value);
  }
}

export const __testing = {
  buildUserOverviewWhere,
  buildCompletedTaskConditions,
};

export const taskThinRepository = new TaskThinRepository();
