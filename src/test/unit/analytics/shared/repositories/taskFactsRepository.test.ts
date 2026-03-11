import { tmPrisma } from '../../../../../main/modules/analytics/shared/data/prisma';
import { taskFactsRepository } from '../../../../../main/modules/analytics/shared/repositories/taskFactsRepository';

jest.mock('../../../../../main/modules/analytics/shared/data/prisma', () => ({
  tmPrisma: { $queryRaw: jest.fn() },
}));

describe('taskFactsRepository', () => {
  const snapshotId = 501;

  const queryCall = (indexFromEnd = 0): { sql: string; values: unknown[] } => {
    const calls = (tmPrisma.$queryRaw as jest.Mock).mock.calls;
    return calls[calls.length - 1 - indexFromEnd][0];
  };

  const normaliseSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    jest.clearAllMocks();
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);
  });

  test('executes repository queries with date ranges', async () => {
    const range = { from: new Date('2024-01-01'), to: new Date('2024-01-31') };

    await taskFactsRepository.fetchServiceOverviewRows(snapshotId, {});
    await taskFactsRepository.fetchTaskEventsByServiceRows(snapshotId, {}, range);
    await taskFactsRepository.fetchOverviewFilterOptionsRows(snapshotId);
    await taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows(snapshotId, {});
    await taskFactsRepository.fetchOpenTasksByNameRows(snapshotId, {});
    await taskFactsRepository.fetchOpenTasksByRegionLocationRows(snapshotId, {});
    await taskFactsRepository.fetchOpenTasksSummaryRows(snapshotId, {});
    await taskFactsRepository.fetchTasksDuePriorityRows(snapshotId, {});
    await taskFactsRepository.fetchCompletedSummaryRows(snapshotId, {}, range);
    await taskFactsRepository.fetchUserOverviewCompletedTaskCount(snapshotId, {});
    await taskFactsRepository.fetchCompletedTimelineRows(snapshotId, {}, range);
    await taskFactsRepository.fetchCompletedProcessingHandlingTimeRows(snapshotId, {}, range);
    await taskFactsRepository.fetchCompletedByNameRows(snapshotId, {}, range);
    await taskFactsRepository.fetchCompletedByLocationRows(snapshotId, {}, range);
    await taskFactsRepository.fetchCompletedByRegionRows(snapshotId, {}, range);

    expect(tmPrisma.$queryRaw).toHaveBeenCalled();
  });

  test('handles optional ranges when none are provided', async () => {
    await taskFactsRepository.fetchCompletedSummaryRows(snapshotId, {}, undefined);
    await taskFactsRepository.fetchCompletedTimelineRows(snapshotId, {}, undefined);
    await taskFactsRepository.fetchCompletedProcessingHandlingTimeRows(snapshotId, {}, undefined);
    await taskFactsRepository.fetchCompletedByNameRows(snapshotId, {}, undefined);
    await taskFactsRepository.fetchCompletedByLocationRows(snapshotId, {}, undefined);
    await taskFactsRepository.fetchCompletedByRegionRows(snapshotId, {}, undefined);

    expect(tmPrisma.$queryRaw).toHaveBeenCalledTimes(6);
  });

  test('builds task events query with explicit date range filters', async () => {
    const from = new Date('2024-01-01');
    const to = new Date('2024-01-31');

    await taskFactsRepository.fetchTaskEventsByServiceRows(snapshotId, { service: ['A'] }, { from, to });
    const query = queryCall();

    expect(query.sql).toContain('reference_date >=');
    expect(query.sql).toContain('reference_date <=');
    expect(query.sql).toContain("date_role IN ('created', 'completed', 'cancelled')");
    expect(query.sql).toContain('snapshot_id =');
    expect(query.values).toEqual(expect.arrayContaining([snapshotId, from, to]));
  });

  test('builds completed summary query for open-ended ranges', async () => {
    const from = new Date('2024-02-01');
    const to = new Date('2024-02-15');

    await taskFactsRepository.fetchCompletedSummaryRows(snapshotId, {}, { from });
    const fromQuery = queryCall();
    expect(fromQuery.sql).toContain("date_role = 'completed'");
    expect(fromQuery.sql).toContain("task_status = 'completed'");
    expect(fromQuery.sql).toContain('snapshot_id =');
    expect(fromQuery.sql).toContain('reference_date >=');
    expect(fromQuery.sql).not.toContain('reference_date <=');
    expect(fromQuery.values).toEqual(expect.arrayContaining([snapshotId, from]));

    await taskFactsRepository.fetchCompletedSummaryRows(snapshotId, {}, { to });
    const toQuery = queryCall();
    expect(toQuery.sql).toContain("date_role = 'completed'");
    expect(toQuery.sql).toContain("task_status = 'completed'");
    expect(toQuery.sql).toContain('snapshot_id =');
    expect(toQuery.sql).toContain('reference_date <=');
    expect(toQuery.sql).not.toContain('reference_date >=');
    expect(toQuery.values).toEqual(expect.arrayContaining([snapshotId, to]));
  });

  test('fetchOverviewFilterOptionsRows executes a faceted snapshot filter-options query', async () => {
    await taskFactsRepository.fetchOverviewFilterOptionsRows(snapshotId);

    expect(tmPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    const query = queryCall();
    const normalised = normaliseSql(query.sql);

    expect(normalised).toContain('WITH option_rows AS');
    expect(normalised).toContain('deduped_options AS');
    expect(normalised).toContain('FROM analytics.snapshot_filter_facet_facts');
    expect(normalised).toContain('snapshot_id =');
    expect(normalised).toContain("SELECT 'service'::text AS option_type");
    expect(normalised).toContain("SELECT 'assignee'::text AS option_type");
    expect(normalised).toContain('GROUP BY option_type, value');
    expect(normalised).toContain('LEFT JOIN cft_task_db.work_types');
    expect(normalised).toContain("deduped_options.option_type = 'workType'");
    expect(normalised).toContain(
      "CASE WHEN deduped_options.option_type = 'workType' THEN COALESCE(work_types.label, deduped_options.value)"
    );
    expect(normalised).toContain('ORDER BY deduped_options.option_type ASC, text ASC, deduped_options.value ASC');
    expect(normalised).not.toContain('FROM analytics.snapshot_filter_option_values');
  });

  test('maps filter option rows into typed option arrays', async () => {
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      { option_type: 'service', value: 'Civil', text: 'Civil' },
      { option_type: 'roleCategory', value: 'Ops', text: 'Ops' },
      { option_type: 'region', value: 'North', text: 'North' },
      { option_type: 'location', value: 'Leeds', text: 'Leeds' },
      { option_type: 'taskName', value: 'Review', text: 'Review' },
      { option_type: 'workType', value: 'hearing', text: 'Hearing' },
      { option_type: 'assignee', value: 'user-1', text: 'user-1' },
    ]);

    const options = await taskFactsRepository.fetchOverviewFilterOptionsRows(snapshotId);

    expect(options.services).toEqual([{ value: 'Civil' }]);
    expect(options.roleCategories).toEqual([{ value: 'Ops' }]);
    expect(options.regions).toEqual([{ value: 'North' }]);
    expect(options.locations).toEqual([{ value: 'Leeds' }]);
    expect(options.taskNames).toEqual([{ value: 'Review' }]);
    expect(options.workTypes).toEqual([{ value: 'hearing', text: 'Hearing' }]);
    expect(options.assignees).toEqual([{ value: 'user-1' }]);
  });

  test('applies role-category exclusion options to overview filter option queries', async () => {
    await taskFactsRepository.fetchOverviewFilterOptionsRows(snapshotId, {
      excludeRoleCategories: ['Judicial'],
    });

    const query = queryCall();
    expect(query.sql).toContain('UPPER(role_category_label) NOT IN');
    expect(query.values).toContain('JUDICIAL');
  });

  test('omits assignee branch when user filter facet is disabled', async () => {
    await taskFactsRepository.fetchOverviewFilterOptionsRows(snapshotId, {
      includeUserFilter: false,
    });

    const query = queryCall();
    expect(query.sql).not.toContain("SELECT 'assignee'::text AS option_type");
  });

  test('uses completed-date filtering for processing and handling time', async () => {
    const from = new Date('2024-03-01');
    const to = new Date('2024-03-10');

    await taskFactsRepository.fetchCompletedProcessingHandlingTimeRows(snapshotId, {}, { from, to });
    const query = queryCall();

    expect(query.sql).toContain("LOWER(termination_reason) = 'completed'");
    expect(query.sql).not.toContain("state IN ('COMPLETED', 'TERMINATED')");
    expect(query.sql).toContain('completed_date IS NOT NULL');
    expect(query.sql).toContain('completed_date >=');
    expect(query.sql).toContain('completed_date <=');
    expect(query.values).toEqual(expect.arrayContaining([from, to]));
  });

  test('applies role-category exclusion options to completed summary queries', async () => {
    await taskFactsRepository.fetchCompletedSummaryRows(
      snapshotId,
      { service: ['Service A'] },
      { from: new Date('2024-07-01'), to: new Date('2024-07-31') },
      { excludeRoleCategories: ['Judicial'] }
    );
    const query = queryCall();

    expect(query.sql).toContain("date_role = 'completed'");
    expect(query.sql).toContain("task_status = 'completed'");
    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain('UPPER(role_category_label) NOT IN');
    expect(query.values).toContain('JUDICIAL');
  });

  test('builds facts-backed user-overview completed count query with filters and query options', async () => {
    const completedFrom = new Date('2024-08-01');
    const completedTo = new Date('2024-08-31');
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ total: 42 }]);

    const total = await taskFactsRepository.fetchUserOverviewCompletedTaskCount(
      snapshotId,
      {
        service: ['Service A'],
        user: ['user-1'],
        completedFrom,
        completedTo,
      },
      { excludeRoleCategories: ['Judicial'] }
    );
    const query = queryCall();

    expect(total).toBe(42);
    expect(query.sql).toContain('SELECT COALESCE(SUM(tasks), 0)::int AS total');
    expect(query.sql).toContain('FROM analytics.snapshot_user_completed_facts');
    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain('completed_date >=');
    expect(query.sql).toContain('completed_date <=');
    expect(query.sql).toContain('assignee IN');
    expect(query.sql).toContain('UPPER(role_category_label) NOT IN');
    expect(query.values).toEqual(
      expect.arrayContaining([snapshotId, completedFrom, completedTo, 'user-1', 'Service A', 'JUDICIAL'])
    );
  });

  test('returns zero for facts-backed user-overview completed count when query has no rows', async () => {
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    const total = await taskFactsRepository.fetchUserOverviewCompletedTaskCount(snapshotId, {});
    const query = queryCall();

    expect(total).toBe(0);
    expect(query.sql).toContain('SELECT COALESCE(SUM(tasks), 0)::int AS total');
    expect(query.sql).toContain('FROM analytics.snapshot_user_completed_facts');
    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).not.toContain('completed_date >=');
    expect(query.sql).not.toContain('completed_date <=');
    expect(query.sql).not.toContain('assignee IN');
  });

  test('omits optional completed-count predicates when filters are empty or users list is empty', async () => {
    (tmPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ total: 3 }]);

    const total = await taskFactsRepository.fetchUserOverviewCompletedTaskCount(snapshotId, { user: [] });
    const query = queryCall();

    expect(total).toBe(3);
    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).not.toContain('completed_date >=');
    expect(query.sql).not.toContain('completed_date <=');
    expect(query.sql).not.toContain('assignee IN');
  });

  test('applies due/open filters and numeric priority rank in due-priority query', async () => {
    await taskFactsRepository.fetchTasksDuePriorityRows(snapshotId, { region: ['North'] });
    const query = queryCall();

    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain("date_role = 'due'");
    expect(query.sql).toContain("task_status = 'open'");
    expect(query.sql).toContain('priority <= 2000');
    expect(query.sql).toContain('priority = 5000 AND reference_date < CURRENT_DATE');
    expect(query.sql).toContain('priority = 5000 AND reference_date = CURRENT_DATE');
    expect(query.sql).toContain('GROUP BY reference_date');
  });

  test('builds service overview query using bucketed CTE and assignment totals', async () => {
    await taskFactsRepository.fetchServiceOverviewRows(snapshotId, { service: ['Service A'], roleCategory: ['Ops'] });
    const query = queryCall();
    const normalised = normaliseSql(query.sql);

    expect(query.sql).toContain('WITH bucketed AS');
    expect(query.sql).toContain('jurisdiction_label AS service');
    expect(query.sql).toContain(
      "SUM(CASE WHEN assignment_state = 'Assigned' THEN task_count ELSE 0 END)::int AS assigned_tasks"
    );
    expect(query.sql).toContain('SUM(CASE WHEN priority_rank = 4 THEN task_count ELSE 0 END)::int AS urgent');
    expect(query.sql).toContain("date_role = 'due'");
    expect(query.sql).toContain("task_status = 'open'");
    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain('priority <= 2000');
    expect(query.sql).toContain('priority = 5000 AND reference_date < CURRENT_DATE');
    expect(normalised).toContain('ORDER BY service ASC');
    expect(query.sql).toContain('GROUP BY jurisdiction_label');
  });

  test('builds created-by-assignment query with grouping by date and assignment state', async () => {
    await taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows(snapshotId, { region: ['North'] });
    const query = queryCall();

    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain("date_role = 'created'");
    expect(query.sql).toContain("task_status = 'open'");
    expect(query.sql).toContain("to_char(reference_date, 'YYYY-MM-DD') AS date_key");
    expect(query.sql).toContain('assignment_state');
    expect(query.sql).toContain('GROUP BY reference_date, assignment_state');
    expect(query.sql).toContain('ORDER BY reference_date');
  });

  test('builds facts-backed open-task by-name query', async () => {
    await taskFactsRepository.fetchOpenTasksByNameRows(snapshotId, { region: ['North'] });
    const query = queryCall();

    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain("date_role = 'due'");
    expect(query.sql).toContain("task_status = 'open'");
    expect(query.sql).toContain('WITH bucketed AS');
    expect(query.sql).toContain('task_name');
    expect(query.sql).toContain('GROUP BY task_name');
    expect(query.sql).toContain('ORDER BY task_name ASC');
    expect(query.sql).toContain('priority <= 2000');
    expect(query.sql).toContain('priority = 5000 AND reference_date < CURRENT_DATE');
  });

  test('builds facts-backed open-task by-region-location query', async () => {
    await taskFactsRepository.fetchOpenTasksByRegionLocationRows(snapshotId, { location: ['Leeds'] });
    const query = queryCall();

    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain("date_role = 'due'");
    expect(query.sql).toContain("task_status = 'open'");
    expect(query.sql).toContain('WITH bucketed AS');
    expect(query.sql).toContain('GROUP BY region, location');
    expect(query.sql).toContain('ORDER BY location ASC, region ASC');
    expect(query.sql).toContain('SUM(task_count)::int AS open_tasks');
    expect(query.sql).toContain('priority <= 2000');
    expect(query.sql).toContain('priority = 5000 AND reference_date < CURRENT_DATE');
    expect(query.sql).toContain('priority = 5000 AND reference_date = CURRENT_DATE');
  });

  test('builds facts-backed open-task summary query', async () => {
    await taskFactsRepository.fetchOpenTasksSummaryRows(snapshotId, { service: ['Service A'] });
    const query = queryCall();

    expect(query.sql).toContain('snapshot_id =');
    expect(query.sql).toContain("date_role = 'due'");
    expect(query.sql).toContain("task_status = 'open'");
    expect(query.sql).toContain('WITH bucketed AS');
    expect(query.sql).toContain(
      "SUM(CASE WHEN assignment_state = 'Assigned' THEN task_count ELSE 0 END)::int AS assigned"
    );
    expect(query.sql).toContain(
      "SUM(CASE WHEN assignment_state = 'Assigned' THEN 0 ELSE task_count END)::int AS unassigned"
    );
    expect(query.sql).toContain('priority <= 2000');
    expect(query.sql).toContain('priority = 5000 AND reference_date = CURRENT_DATE');
  });

  test('builds timeline query with open-ended range combinations', async () => {
    const from = new Date('2024-04-01');
    const to = new Date('2024-04-15');

    await taskFactsRepository.fetchCompletedTimelineRows(snapshotId, {}, { from });
    const fromQuery = queryCall();
    expect(fromQuery.sql).toContain("date_role = 'completed'");
    expect(fromQuery.sql).toContain("task_status = 'completed'");
    expect(fromQuery.sql).toContain('snapshot_id =');
    expect(fromQuery.sql).toContain('reference_date >=');
    expect(fromQuery.sql).not.toContain('reference_date <=');
    expect(fromQuery.sql).toContain('GROUP BY reference_date');
    expect(fromQuery.sql).toContain('ORDER BY reference_date');
    expect(fromQuery.values).toEqual(expect.arrayContaining([from]));

    await taskFactsRepository.fetchCompletedTimelineRows(snapshotId, {}, { to });
    const toQuery = queryCall();
    expect(toQuery.sql).toContain("date_role = 'completed'");
    expect(toQuery.sql).toContain("task_status = 'completed'");
    expect(toQuery.sql).toContain('snapshot_id =');
    expect(toQuery.sql).toContain('reference_date <=');
    expect(toQuery.sql).not.toContain('reference_date >=');
    expect(toQuery.values).toEqual(expect.arrayContaining([to]));
  });

  test('builds completed by name/location/region queries and range filters', async () => {
    const from = new Date('2024-05-01');
    const to = new Date('2024-05-31');

    await taskFactsRepository.fetchCompletedByNameRows(snapshotId, { service: ['Service A'] }, { from, to });
    const byNameQuery = queryCall();
    expect(byNameQuery.sql).toContain("date_role = 'completed'");
    expect(byNameQuery.sql).toContain("task_status = 'completed'");
    expect(byNameQuery.sql).toContain('snapshot_id =');
    expect(byNameQuery.sql).toContain('task_name');
    expect(byNameQuery.sql).toContain('SUM(task_count)::int AS total');
    expect(byNameQuery.sql).toContain('SUM(CASE WHEN sla_flag IS TRUE THEN task_count ELSE 0 END)::int AS within');
    expect(byNameQuery.sql).toContain('GROUP BY task_name');
    expect(byNameQuery.sql).toContain('ORDER BY total DESC');
    expect(byNameQuery.values).toEqual(expect.arrayContaining([from, to]));

    await taskFactsRepository.fetchCompletedByLocationRows(snapshotId, { region: ['North'] }, { from, to });
    const byLocationQuery = queryCall();
    expect(byLocationQuery.sql).toContain("date_role = 'completed'");
    expect(byLocationQuery.sql).toContain("task_status = 'completed'");
    expect(byLocationQuery.sql).toContain('snapshot_id =');
    expect(byLocationQuery.sql).toContain('location');
    expect(byLocationQuery.sql).toContain('region');
    expect(byLocationQuery.sql).toContain('SUM(handling_time_days_sum)::double precision AS handling_time_days_sum');
    expect(byLocationQuery.sql).toContain('SUM(processing_time_days_count)::int AS processing_time_days_count');
    expect(byLocationQuery.sql).toContain('GROUP BY location, region');
    expect(byLocationQuery.sql).toContain('ORDER BY location ASC, region ASC');
    expect(byLocationQuery.values).toEqual(expect.arrayContaining([from, to]));

    await taskFactsRepository.fetchCompletedByRegionRows(snapshotId, { region: ['North'] }, { from, to });
    const byRegionQuery = queryCall();
    expect(byRegionQuery.sql).toContain("date_role = 'completed'");
    expect(byRegionQuery.sql).toContain("task_status = 'completed'");
    expect(byRegionQuery.sql).toContain('snapshot_id =');
    expect(byRegionQuery.sql).toContain('region');
    expect(byRegionQuery.sql).toContain('SUM(task_count)::int AS total');
    expect(byRegionQuery.sql).toContain('SUM(processing_time_days_sum)::double precision AS processing_time_days_sum');
    expect(byRegionQuery.sql).toContain('GROUP BY region');
    expect(byRegionQuery.sql).toContain('ORDER BY region ASC');
    expect(byRegionQuery.values).toEqual(expect.arrayContaining([from, to]));
  });

  test('builds processing/handling query with aggregate columns and optional range bounds', async () => {
    const from = new Date('2024-06-01');
    const to = new Date('2024-06-20');

    await taskFactsRepository.fetchCompletedProcessingHandlingTimeRows(snapshotId, {}, { from });
    const fromQuery = queryCall();
    expect(fromQuery.sql).toContain('snapshot_id =');
    expect(fromQuery.sql).toContain("LOWER(termination_reason) = 'completed'");
    expect(fromQuery.sql).toContain('completed_date IS NOT NULL');
    expect(fromQuery.sql).toContain("AVG(EXTRACT(EPOCH FROM handling_time) / EXTRACT(EPOCH FROM INTERVAL '1 day'))");
    expect(fromQuery.sql).toContain(
      "STDDEV_POP(EXTRACT(EPOCH FROM processing_time) / EXTRACT(EPOCH FROM INTERVAL '1 day'))"
    );
    expect(fromQuery.sql).toContain('COUNT(processing_time)::int AS processing_count');
    expect(fromQuery.sql).toContain('completed_date >=');
    expect(fromQuery.sql).not.toContain('completed_date <=');
    expect(fromQuery.values).toEqual(expect.arrayContaining([from]));

    await taskFactsRepository.fetchCompletedProcessingHandlingTimeRows(snapshotId, {}, { to });
    const toQuery = queryCall();
    expect(toQuery.sql).toContain('snapshot_id =');
    expect(toQuery.sql).toContain("LOWER(termination_reason) = 'completed'");
    expect(toQuery.sql).toContain('completed_date IS NOT NULL');
    expect(toQuery.sql).toContain('completed_date <=');
    expect(toQuery.sql).not.toContain('completed_date >=');
    expect(toQuery.values).toEqual(expect.arrayContaining([to]));
  });
});
