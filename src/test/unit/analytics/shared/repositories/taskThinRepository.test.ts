import { Prisma } from '@prisma/client';

import { tmPrisma } from '../../../../../main/modules/analytics/shared/data/prisma';
import { getDefaultOutstandingSort } from '../../../../../main/modules/analytics/shared/outstandingSort';
import {
  __testing,
  taskThinRepository,
} from '../../../../../main/modules/analytics/shared/repositories/taskThinRepository';
import {
  AssignedSortBy,
  CompletedSortBy,
  getDefaultUserOverviewSort,
} from '../../../../../main/modules/analytics/shared/userOverviewSort';

jest.mock('../../../../../main/modules/analytics/shared/data/prisma', () => ({
  tmPrisma: { $queryRaw: jest.fn() },
}));

describe('taskThinRepository', () => {
  const snapshotId = 502;

  const latestQuery = (): { sql: string; values: unknown[] } => {
    const calls = (tmPrisma.$queryRaw as jest.Mock).mock.calls;
    return calls[calls.length - 1][0];
  };

  const normaliseSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    jest.clearAllMocks();
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);
  });

  test('executes core query methods', async () => {
    const sort = getDefaultUserOverviewSort();
    const outstandingSort = getDefaultOutstandingSort();
    await taskThinRepository.fetchUserOverviewAssignedTaskRows(snapshotId, {}, sort.assigned, {
      page: 1,
      pageSize: 20,
    });
    await taskThinRepository.fetchUserOverviewAssignedTaskRows(snapshotId, {}, sort.assigned, null);
    await taskThinRepository.fetchUserOverviewCompletedTaskRows(snapshotId, {}, sort.completed, {
      page: 1,
      pageSize: 20,
    });
    await taskThinRepository.fetchUserOverviewCompletedTaskRows(snapshotId, {}, sort.completed, null);
    await taskThinRepository.fetchUserOverviewAssignedTaskCount(snapshotId, {});
    await taskThinRepository.fetchUserOverviewCompletedTaskCount(snapshotId, {});
    await taskThinRepository.fetchUserOverviewCompletedByDateRows(snapshotId, {});
    await taskThinRepository.fetchUserOverviewCompletedByTaskNameRows(snapshotId, {});
    await taskThinRepository.fetchOutstandingCriticalTaskRows(snapshotId, {}, outstandingSort.criticalTasks, {
      page: 1,
      pageSize: 20,
    });
    await taskThinRepository.fetchOutstandingCriticalTaskCount(snapshotId, {});
    await taskThinRepository.fetchWaitTimeByAssignedDateRows(snapshotId, {});
    await taskThinRepository.fetchTasksDueByDateRows(snapshotId, {});

    expect(tmPrisma.$queryRaw).toHaveBeenCalled();
  });

  test('maps assignee ids', async () => {
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ value: 'user-1' }, { value: 'user-2' }]);

    const result = await taskThinRepository.fetchAssigneeIds(snapshotId);

    expect(result).toEqual(['user-1', 'user-2']);
  });

  test('covers assigned sort options', async () => {
    const baseSort = getDefaultUserOverviewSort().assigned;
    const sortKeys: AssignedSortBy[] = [
      'caseId',
      'createdDate',
      'taskName',
      'assignedDate',
      'dueDate',
      'priority',
      'totalAssignments',
      'assignee',
      'location',
    ];

    const expectedOrderBySqlBySort: Record<AssignedSortBy, string> = {
      caseId: 'ORDER BY case_id ASC NULLS LAST',
      createdDate: 'ORDER BY analytics.snapshot_task_rows.created_date ASC NULLS LAST',
      taskName: 'ORDER BY task_name ASC NULLS LAST',
      assignedDate: 'ORDER BY analytics.snapshot_task_rows.first_assigned_date ASC NULLS LAST',
      dueDate: 'ORDER BY analytics.snapshot_task_rows.due_date ASC NULLS LAST',
      priority: 'ORDER BY CASE WHEN major_priority <= 2000 THEN 4',
      totalAssignments: 'ORDER BY COALESCE(number_of_reassignments, 0) + 1 ASC NULLS LAST',
      assignee: 'ORDER BY assignee ASC NULLS LAST',
      location: 'ORDER BY location ASC NULLS LAST',
    };

    for (const key of sortKeys) {
      await taskThinRepository.fetchUserOverviewAssignedTaskRows(
        snapshotId,
        {},
        { ...baseSort, by: key, dir: 'asc' },
        { page: 1, pageSize: 20 }
      );
      const query = latestQuery();
      const normalised = normaliseSql(query.sql);
      expect(normalised).toContain(expectedOrderBySqlBySort[key]);
      expect(normalised).toContain('ASC NULLS LAST');
      expect(query.sql).toContain('snapshot_id =');
      expect(query.sql).toContain("state = 'ASSIGNED'");
      expect(query.values).toContain(snapshotId);
    }

    await taskThinRepository.fetchUserOverviewAssignedTaskRows(
      snapshotId,
      { user: ['user-1'] },
      { ...baseSort, by: 'caseId', dir: 'asc' },
      { page: 1, pageSize: 20 }
    );
    const userFiltered = latestQuery();
    const userFilteredNormalised = normaliseSql(userFiltered.sql);
    expect(userFiltered.sql).toContain('assignee IN');
    expect(userFilteredNormalised).toContain('ORDER BY case_id ASC NULLS LAST');
    expect(userFiltered.values).toContain('user-1');

    await taskThinRepository.fetchUserOverviewAssignedTaskRows(
      snapshotId,
      {},
      {
        ...baseSort,
        by: 'unknown' as AssignedSortBy,
        dir: 'desc',
      },
      { page: 1, pageSize: 20 }
    );
    const fallbackSort = latestQuery();
    expect(normaliseSql(fallbackSort.sql)).toContain(
      'ORDER BY analytics.snapshot_task_rows.created_date DESC NULLS LAST'
    );

    expect(tmPrisma.$queryRaw).toHaveBeenCalled();
  });

  test('covers completed sort options and date filters', async () => {
    const baseSort = getDefaultUserOverviewSort().completed;
    const sortKeys: CompletedSortBy[] = [
      'caseId',
      'createdDate',
      'taskName',
      'assignedDate',
      'dueDate',
      'completedDate',
      'handlingTimeDays',
      'withinDue',
      'totalAssignments',
      'assignee',
      'location',
    ];

    const expectedOrderBySqlBySort: Record<CompletedSortBy, string> = {
      caseId: 'ORDER BY case_id ASC NULLS LAST',
      createdDate: 'ORDER BY analytics.snapshot_task_rows.created_date ASC NULLS LAST',
      taskName: 'ORDER BY task_name ASC NULLS LAST',
      assignedDate: 'ORDER BY analytics.snapshot_task_rows.first_assigned_date ASC NULLS LAST',
      dueDate: 'ORDER BY analytics.snapshot_task_rows.due_date ASC NULLS LAST',
      completedDate: 'ORDER BY analytics.snapshot_task_rows.completed_date ASC NULLS LAST',
      handlingTimeDays:
        "ORDER BY EXTRACT(EPOCH FROM handling_time) / EXTRACT(EPOCH FROM INTERVAL '1 day') ASC NULLS LAST",
      withinDue: 'ORDER BY within_due_sort_value ASC NULLS LAST',
      totalAssignments: 'ORDER BY COALESCE(number_of_reassignments, 0) + 1 ASC NULLS LAST',
      assignee: 'ORDER BY assignee ASC NULLS LAST',
      location: 'ORDER BY location ASC NULLS LAST',
    };

    for (const key of sortKeys) {
      const filters = { completedFrom: new Date('2024-01-01'), completedTo: new Date('2024-01-10') };
      await taskThinRepository.fetchUserOverviewCompletedTaskRows(
        snapshotId,
        filters,
        { ...baseSort, by: key, dir: 'asc' },
        { page: 1, pageSize: 20 }
      );
      const query = latestQuery();
      const normalised = normaliseSql(query.sql);
      expect(normalised).toContain(expectedOrderBySqlBySort[key]);
      expect(query.sql).toContain("LOWER(termination_reason) = 'completed'");
      expect(query.sql).not.toContain("state IN ('COMPLETED', 'TERMINATED')");
      expect(query.sql).toContain('completed_date >=');
      expect(query.sql).toContain('completed_date <=');
      expect(query.sql).toContain('snapshot_id =');
      expect(query.values).toContain(snapshotId);
      expect(query.values).toEqual(expect.arrayContaining([filters.completedFrom, filters.completedTo]));
    }

    await taskThinRepository.fetchUserOverviewCompletedTaskRows(
      snapshotId,
      { completedFrom: new Date('2024-01-01'), completedTo: new Date('2024-01-10') },
      { ...baseSort, by: 'unknown' as CompletedSortBy, dir: 'desc' },
      { page: 1, pageSize: 20 }
    );
    const fallbackSort = latestQuery();
    expect(normaliseSql(fallbackSort.sql)).toContain(
      'ORDER BY analytics.snapshot_task_rows.completed_date DESC NULLS LAST'
    );

    expect(tmPrisma.$queryRaw).toHaveBeenCalled();
  });

  test('adds user filters for completed-by-date and completed-by-task-name queries', async () => {
    await taskThinRepository.fetchUserOverviewCompletedByDateRows(snapshotId, { user: ['user-1'] });
    const withUserByDate = latestQuery();
    expect(withUserByDate.sql).toContain('assignee IN');
    expect(withUserByDate.values).toContain('user-1');
    expect(withUserByDate.sql).toContain('snapshot_id =');

    await taskThinRepository.fetchUserOverviewCompletedByTaskNameRows(snapshotId, { user: ['user-1'] });
    const withUserByTaskName = latestQuery();
    expect(withUserByTaskName.sql).toContain('assignee IN');
    expect(withUserByTaskName.values).toContain('user-1');
    expect(withUserByTaskName.sql).toContain('snapshot_id =');

    await taskThinRepository.fetchUserOverviewCompletedByDateRows(snapshotId, { user: [] });
    const withEmptyUsersByDate = latestQuery();
    expect(withEmptyUsersByDate.sql).not.toContain('assignee IN');

    await taskThinRepository.fetchUserOverviewCompletedByTaskNameRows(snapshotId, { user: [] });
    const withEmptyUsersByTaskName = latestQuery();
    expect(withEmptyUsersByTaskName.sql).not.toContain('assignee IN');

    expect(tmPrisma.$queryRaw).toHaveBeenCalled();
  });

  test('includes case ID filters when fetching completed task audits', async () => {
    await taskThinRepository.fetchCompletedTaskAuditRows(
      snapshotId,
      { completedFrom: new Date('2024-01-01') },
      'CASE-123'
    );
    const query = latestQuery();

    expect(query.sql).toContain('case_id =');
    expect(query.values).toContain('CASE-123');
    expect(tmPrisma.$queryRaw).toHaveBeenCalled();
  });

  test('builds user overview where clauses for user-only filters', () => {
    const whereClause = __testing.buildUserOverviewWhere(snapshotId, { user: ['user-1'] }, []);
    const whereClauseWithoutUsers = __testing.buildUserOverviewWhere(snapshotId, { user: [] }, [
      Prisma.sql`state = 'ASSIGNED'`,
    ]);

    expect(whereClause.sql).toContain('WHERE');
    expect(whereClause.sql).toContain('assignee IN');
    expect(whereClause.sql).toContain('snapshot_id =');
    expect(whereClauseWithoutUsers.sql).not.toContain('assignee IN');
    expect(whereClauseWithoutUsers.sql).toContain('snapshot_id =');
  });

  test('applies role-category query options to user-overview SQL paths', async () => {
    const queryOptions = { excludeRoleCategories: ['Judicial'] };
    const completedFilters = { completedFrom: new Date('2024-01-01'), completedTo: new Date('2024-01-10') };

    await taskThinRepository.fetchUserOverviewAssignedTaskRows(
      snapshotId,
      {},
      getDefaultUserOverviewSort().assigned,
      { page: 1, pageSize: 20 },
      queryOptions
    );
    const assignedRowsQuery = latestQuery();
    expect(assignedRowsQuery.sql).toContain('UPPER(role_category_label) NOT IN');
    expect(assignedRowsQuery.values).toContain('JUDICIAL');

    await taskThinRepository.fetchUserOverviewCompletedTaskCount(snapshotId, completedFilters, queryOptions);
    const completedCountQuery = latestQuery();
    expect(completedCountQuery.sql).toContain('UPPER(role_category_label) NOT IN');
    expect(completedCountQuery.values).toContain('JUDICIAL');

    await taskThinRepository.fetchUserOverviewCompletedByDateRows(snapshotId, completedFilters, queryOptions);
    const completedByDateQuery = latestQuery();
    expect(completedByDateQuery.sql).toContain('UPPER(role_category_label) NOT IN');
    expect(completedByDateQuery.values).toContain('JUDICIAL');
  });

  test('builds completed task conditions with and without case id', () => {
    const withoutCaseId = __testing.buildCompletedTaskConditions({
      completedFrom: new Date('2024-01-01'),
      completedTo: new Date('2024-01-10'),
    });
    const withCaseId = __testing.buildCompletedTaskConditions(
      {
        completedFrom: new Date('2024-01-01'),
        completedTo: new Date('2024-01-10'),
      },
      'CASE-42'
    );

    expect(withoutCaseId.map(condition => condition.sql).join(' ')).toContain(
      "LOWER(termination_reason) = 'completed'"
    );
    expect(withoutCaseId.map(condition => condition.sql).join(' ')).not.toContain(
      "state IN ('COMPLETED', 'TERMINATED')"
    );
    expect(withoutCaseId.map(condition => condition.sql).join(' ')).not.toContain('case_id =');
    expect(withCaseId.map(condition => condition.sql).join(' ')).toContain('case_id =');
    expect(withCaseId.flatMap(condition => condition.values)).toContain('CASE-42');
  });

  test('covers critical task sort options and user filtering', async () => {
    const outstandingSort = getDefaultOutstandingSort().criticalTasks;
    const sortKeys = [
      'caseId',
      'caseType',
      'location',
      'taskName',
      'createdDate',
      'dueDate',
      'priority',
      'agentName',
    ] as const;

    const expectedSqlBySort: Record<(typeof sortKeys)[number], string> = {
      caseId: 'ORDER BY case_id ASC NULLS LAST',
      caseType: 'ORDER BY case_type_label ASC NULLS LAST',
      location: 'ORDER BY location ASC NULLS LAST',
      taskName: 'ORDER BY task_name ASC NULLS LAST',
      createdDate: 'ORDER BY analytics.snapshot_task_rows.created_date ASC NULLS LAST',
      dueDate: 'ORDER BY analytics.snapshot_task_rows.due_date ASC NULLS LAST',
      priority: 'ORDER BY CASE WHEN analytics.snapshot_task_rows.major_priority <= 2000 THEN 4',
      agentName: 'ORDER BY assignee ASC NULLS LAST',
    };

    for (const key of sortKeys) {
      await taskThinRepository.fetchOutstandingCriticalTaskRows(
        snapshotId,
        { user: ['user-1'] },
        { ...outstandingSort, by: key },
        { page: 1, pageSize: 20 }
      );
      const query = latestQuery();
      const normalised = normaliseSql(query.sql);
      expect(normalised).toContain(expectedSqlBySort[key]);
      expect(normalised).toContain('ASC NULLS LAST');
      expect(query.sql).toContain("state NOT IN ('COMPLETED', 'TERMINATED')");
      expect(query.sql).toContain('snapshot_id =');
      expect(query.values).toContain(snapshotId);
    }

    await taskThinRepository.fetchOutstandingCriticalTaskRows(
      snapshotId,
      { user: ['user-1'] },
      { ...outstandingSort, by: 'unknown' as typeof outstandingSort.by, dir: 'desc' },
      { page: 1, pageSize: 20 }
    );
    const fallbackSort = latestQuery();
    expect(normaliseSql(fallbackSort.sql)).toContain('ORDER BY analytics.snapshot_task_rows.due_date DESC NULLS LAST');

    expect(tmPrisma.$queryRaw).toHaveBeenCalled();
  });

  test('caps LIMIT/OFFSET values for oversized pagination requests', async () => {
    const sort = getDefaultOutstandingSort().criticalTasks;

    await taskThinRepository.fetchOutstandingCriticalTaskRows(snapshotId, {}, sort, { page: 999, pageSize: 50 });
    const firstQuery = (tmPrisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(firstQuery.values.slice(-2)).toEqual([50, 450]);

    (tmPrisma.$queryRaw as jest.Mock).mockClear();
    await taskThinRepository.fetchOutstandingCriticalTaskRows(snapshotId, {}, sort, { page: 2, pageSize: 9000 });
    const secondQuery = (tmPrisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(secondQuery.values.slice(-2)).toEqual([500, 0]);
  });

  test('normalises pagination with non-finite and negative page sizes', async () => {
    const sort = getDefaultOutstandingSort().criticalTasks;

    await taskThinRepository.fetchOutstandingCriticalTaskRows(snapshotId, {}, sort, { page: 7, pageSize: Number.NaN });
    const nonFinite = latestQuery();
    expect(nonFinite.values.slice(-2)).toEqual([1, 6]);

    await taskThinRepository.fetchOutstandingCriticalTaskRows(snapshotId, {}, sort, { page: 1, pageSize: -20 });
    const negative = latestQuery();
    expect(negative.values.slice(-2)).toEqual([1, 0]);

    await taskThinRepository.fetchOutstandingCriticalTaskRows(snapshotId, {}, sort, { page: 2, pageSize: 2.9 });
    const decimal = latestQuery();
    expect(decimal.values.slice(-2)).toEqual([2, 2]);
  });

  test('uses query-time priority sorting and indexed within-due ordering', async () => {
    const userSort = getDefaultUserOverviewSort();
    const outstandingSort = getDefaultOutstandingSort().criticalTasks;

    await taskThinRepository.fetchUserOverviewAssignedTaskRows(
      snapshotId,
      {},
      { ...userSort.assigned, by: 'priority', dir: 'asc' },
      { page: 1, pageSize: 20 }
    );
    const assignedPriorityQuery = latestQuery();
    const assignedPriorityNormalised = normaliseSql(assignedPriorityQuery.sql);
    expect(assignedPriorityNormalised).toContain('ORDER BY CASE');
    expect(assignedPriorityNormalised).toContain('major_priority <= 2000');
    expect(assignedPriorityNormalised).toContain('ASC NULLS LAST');
    expect(assignedPriorityQuery.sql).toContain('CASE');
    expect(assignedPriorityQuery.sql).toContain('AS priority_rank');

    await taskThinRepository.fetchUserOverviewCompletedTaskRows(
      snapshotId,
      {},
      { ...userSort.completed, by: 'withinDue', dir: 'desc' },
      { page: 1, pageSize: 20 }
    );
    const completedWithinDueQuery = latestQuery();
    const completedWithinDueNormalised = normaliseSql(completedWithinDueQuery.sql);
    expect(completedWithinDueNormalised).toContain('ORDER BY within_due_sort_value DESC NULLS LAST');

    await taskThinRepository.fetchOutstandingCriticalTaskRows(
      snapshotId,
      {},
      { ...outstandingSort, by: 'priority', dir: 'desc' },
      { page: 1, pageSize: 20 }
    );
    const criticalPriorityQuery = latestQuery();
    const criticalPriorityNormalised = normaliseSql(criticalPriorityQuery.sql);
    expect(criticalPriorityNormalised).toContain('ORDER BY CASE');
    expect(criticalPriorityNormalised).toContain('analytics.snapshot_task_rows.major_priority <= 2000');
    expect(criticalPriorityNormalised).toContain('DESC NULLS LAST');
    expect(criticalPriorityQuery.sql).toContain('CASE');
    expect(criticalPriorityQuery.sql).toContain('AS priority_rank');
  });

  test('returns zero when count queries return no rows', async () => {
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    const assignedTotal = await taskThinRepository.fetchUserOverviewAssignedTaskCount(snapshotId, { user: ['user-1'] });
    const completedTotal = await taskThinRepository.fetchUserOverviewCompletedTaskCount(snapshotId, {
      user: ['user-1'],
      completedFrom: new Date('2024-02-01'),
      completedTo: new Date('2024-02-28'),
    });

    const assignedCountQuery = (tmPrisma.$queryRaw as jest.Mock).mock.calls[0][0];
    const completedCountQuery = (tmPrisma.$queryRaw as jest.Mock).mock.calls[1][0];

    expect(assignedTotal).toBe(0);
    expect(completedTotal).toBe(0);
    expect(assignedCountQuery.sql).toContain('COUNT(*)::int AS total');
    expect(assignedCountQuery.sql).toContain("state = 'ASSIGNED'");
    expect(assignedCountQuery.sql).toContain('assignee IN');
    expect(assignedCountQuery.values).toContain('user-1');
    expect(completedCountQuery.sql).toContain("LOWER(termination_reason) = 'completed'");
    expect(completedCountQuery.sql).not.toContain("state IN ('COMPLETED', 'TERMINATED')");
    expect(completedCountQuery.sql).toContain('completed_date >=');
    expect(completedCountQuery.sql).toContain('completed_date <=');
    expect(completedCountQuery.sql).toContain('assignee IN');
  });

  test('returns outstanding critical task count from SQL result', async () => {
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ total: 9 }]);

    const total = await taskThinRepository.fetchOutstandingCriticalTaskCount(snapshotId, { region: ['North'] });
    const query = latestQuery();

    expect(total).toBe(9);
    expect(query.sql).toContain('COUNT(*)::int AS total');
    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain("state NOT IN ('COMPLETED', 'TERMINATED')");
    expect(query.values).toContain(snapshotId);
  });

  test('omits completed date predicates when completed filters are not provided', async () => {
    const sort = getDefaultUserOverviewSort().completed;

    await taskThinRepository.fetchUserOverviewCompletedTaskRows(snapshotId, {}, sort, { page: 1, pageSize: 20 });
    const completedRowsQuery = latestQuery();
    expect(completedRowsQuery.sql).toContain("LOWER(termination_reason) = 'completed'");
    expect(completedRowsQuery.sql).not.toContain('completed_date >=');
    expect(completedRowsQuery.sql).not.toContain('completed_date <=');

    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ total: 4 }]);
    await taskThinRepository.fetchUserOverviewCompletedTaskCount(snapshotId, {});
    const completedCountQuery = latestQuery();
    expect(completedCountQuery.sql).toContain("LOWER(termination_reason) = 'completed'");
    expect(completedCountQuery.sql).not.toContain('completed_date >=');
    expect(completedCountQuery.sql).not.toContain('completed_date <=');
  });

  test('builds completed by date and task-name aggregate queries with filters', async () => {
    const completedFrom = new Date('2024-03-01');
    const completedTo = new Date('2024-03-15');
    const filters = { completedFrom, completedTo, user: ['user-1'] };

    await taskThinRepository.fetchUserOverviewCompletedByDateRows(snapshotId, filters);
    const completedByDateQuery = latestQuery();
    expect(completedByDateQuery.sql).toContain('completed_date IS NOT NULL');
    expect(completedByDateQuery.sql).toContain('SUM(tasks)::int AS tasks');
    expect(completedByDateQuery.sql).toContain('SUM(within_due)::int AS within_due');
    expect(completedByDateQuery.sql).toContain('SUM(handling_time_sum)::numeric AS handling_time_sum');
    expect(completedByDateQuery.sql).toContain('GROUP BY completed_date');
    expect(completedByDateQuery.sql).toContain('ORDER BY completed_date');
    expect(completedByDateQuery.sql).toContain('assignee IN');
    expect(completedByDateQuery.values).toEqual(expect.arrayContaining([completedFrom, completedTo, 'user-1']));

    await taskThinRepository.fetchUserOverviewCompletedByTaskNameRows(snapshotId, filters);
    const completedByTaskNameQuery = latestQuery();
    const completedByTaskNameNormalised = normaliseSql(completedByTaskNameQuery.sql);
    expect(completedByTaskNameNormalised).toContain('completed_date IS NOT NULL');
    expect(completedByTaskNameNormalised).toContain("LOWER(termination_reason) = 'completed'");
    expect(completedByTaskNameNormalised).toContain('COUNT(*)::int AS tasks');
    expect(completedByTaskNameNormalised).toContain(
      "SUM(COALESCE(EXTRACT(EPOCH FROM handling_time) / EXTRACT(EPOCH FROM INTERVAL '1 day'), 0))::double precision AS handling_time_sum"
    );
    expect(completedByTaskNameNormalised).toContain('COUNT(*)::int AS handling_time_count');
    expect(completedByTaskNameNormalised).toContain('due_date_to_completed_diff_time');
    expect(completedByTaskNameNormalised).toContain(
      "EXTRACT(EPOCH FROM due_date_to_completed_diff_time) / EXTRACT(EPOCH FROM INTERVAL '1 day')"
    );
    expect(completedByTaskNameNormalised).toContain('* -1');
    expect(completedByTaskNameNormalised).toContain('AS days_beyond_sum');
    expect(completedByTaskNameNormalised).toContain('COUNT(*)::int AS days_beyond_count');
    expect(completedByTaskNameNormalised).toContain('FROM analytics.snapshot_task_rows');
    expect(completedByTaskNameNormalised).toContain('GROUP BY task_name');
    expect(completedByTaskNameNormalised).toContain('ORDER BY tasks DESC NULLS LAST, task_name ASC');
    expect(completedByTaskNameNormalised).toContain('assignee IN');
    expect(completedByTaskNameQuery.values).toEqual(expect.arrayContaining([completedFrom, completedTo, 'user-1']));
  });

  test('builds wait-time and due-by-date queries', async () => {
    const filters = { region: ['North'], location: ['Leeds'] };

    await taskThinRepository.fetchWaitTimeByAssignedDateRows(snapshotId, filters);
    const waitTimeQuery = latestQuery();
    expect(waitTimeQuery.sql).toContain('snapshot_id =');
    expect(waitTimeQuery.sql).toContain('WHEN SUM(assigned_task_count) = 0 THEN 0');
    expect(waitTimeQuery.sql).toContain(
      "EXTRACT(EPOCH FROM SUM(total_wait_time)) / EXTRACT(EPOCH FROM INTERVAL '1 day')"
    );
    expect(waitTimeQuery.sql).toContain('/ SUM(assigned_task_count)::double precision');
    expect(waitTimeQuery.sql).toContain('GROUP BY reference_date');

    await taskThinRepository.fetchTasksDueByDateRows(snapshotId, filters);
    const tasksDueQuery = latestQuery();
    expect(tasksDueQuery.sql).toContain('snapshot_id =');
    expect(tasksDueQuery.sql).toContain("date_role = 'due'");
    expect(tasksDueQuery.sql).toContain("WHEN task_status = 'open' THEN task_count");
    expect(tasksDueQuery.sql).toContain("WHEN task_status = 'completed' THEN task_count");
    expect(tasksDueQuery.sql).toContain('ORDER BY reference_date');
  });

  test('buildUserOverviewWhere appends user filters to base clauses', () => {
    const whereClause = __testing.buildUserOverviewWhere(snapshotId, { user: ['user-1'] }, [
      Prisma.sql`state = 'ASSIGNED'`,
    ]);

    expect(whereClause.sql).toContain('WHERE');
    expect(whereClause.sql).toContain('AND');
    expect(whereClause.sql).toContain('assignee IN');
    expect(whereClause.values).toContain('user-1');
  });

  test('__testing exposes helper builders', () => {
    expect(typeof __testing.buildUserOverviewWhere).toBe('function');
    expect(typeof __testing.buildCompletedTaskConditions).toBe('function');
  });

  test('emits audit and assignee lookup SQL', async () => {
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ value: 'user-1' }, { value: 'user-2' }]);

    await taskThinRepository.fetchCompletedTaskAuditRows(
      snapshotId,
      { completedFrom: new Date('2024-04-01'), completedTo: new Date('2024-04-30') },
      'CASE-100'
    );
    const auditQuery = (tmPrisma.$queryRaw as jest.Mock).mock.calls[0][0];

    const assigneeIds = await taskThinRepository.fetchAssigneeIds(snapshotId);
    const assigneeQuery = (tmPrisma.$queryRaw as jest.Mock).mock.calls[1][0];

    expect(auditQuery.sql).toContain("LOWER(termination_reason) = 'completed'");
    expect(auditQuery.sql).toContain("to_char(completed_date, 'YYYY-MM-DD') AS completed_date");
    expect(auditQuery.sql).toContain('outcome');
    expect(auditQuery.sql).toContain('ORDER BY completed_date DESC NULLS LAST');
    expect(auditQuery.values).toContain('CASE-100');
    expect(assigneeQuery.sql).toContain('SELECT DISTINCT assignee AS value');
    expect(assigneeQuery.sql).toContain('assignee IS NOT NULL');
    expect(assigneeIds).toEqual(['user-1', 'user-2']);
  });
});
