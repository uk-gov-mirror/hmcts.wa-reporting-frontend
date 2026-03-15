import { Task, TaskStatus, UserTaskRow } from '../../../../main/modules/analytics/shared/types';
import { getDefaultUserOverviewSort } from '../../../../main/modules/analytics/shared/userOverviewSort';
import { UserOverviewMetrics } from '../../../../main/modules/analytics/userOverview/service';
import { __testing, buildUserOverviewViewModel } from '../../../../main/modules/analytics/userOverview/viewModel';

const buildTasks = (rows: UserTaskRow[], status: TaskStatus): Task[] =>
  rows.map(row => ({
    caseId: row.caseId,
    taskId: row.caseId,
    service: 'Service',
    roleCategory: 'Role',
    region: 'Region',
    location: row.location,
    taskName: row.taskName,
    priority: row.priority,
    status,
    createdDate: row.createdDate,
    assignedDate: row.assignedDate,
    dueDate: row.dueDate,
    completedDate: row.completedDate,
    handlingTimeDays: row.handlingTimeDays,
    totalAssignments: row.totalAssignments,
    assigneeName: row.assigneeName,
    withinSla: row.withinDue,
  }));

describe('buildUserOverviewViewModel', () => {
  test('builds priority and row data', () => {
    const overview: UserOverviewMetrics = {
      assigned: [
        {
          caseId: '123',
          taskName: 'Task A',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: '2024-01-03',
          completedDate: undefined,
          priority: 'Urgent',
          totalAssignments: 1,
          assigneeName: 'User One',
          location: 'Leeds',
          status: 'open',
        },
      ],
      completed: [
        {
          caseId: '456',
          taskName: 'Task B',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: '2024-01-03',
          completedDate: '2024-01-04',
          handlingTimeDays: 2.5,
          priority: 'High',
          totalAssignments: 2,
          assigneeName: 'User Two',
          location: 'London',
          status: 'completed',
        },
      ],
      prioritySummary: { urgent: 1, high: 2, medium: 0, low: 0 },
      completedSummary: { total: 1, withinDueYes: 1, withinDueNo: 0 },
      completedByDate: [],
    };
    const completedByDate = [
      { date: '2024-01-04', tasks: 1, withinDue: 0, beyondDue: 1, handlingTimeSum: 2.5, handlingTimeCount: 1 },
    ];
    const completedByTaskName = [
      {
        taskName: 'Task B',
        tasks: 1,
        handlingTimeSum: 2.5,
        handlingTimeCount: 1,
        daysBeyondSum: 1,
        daysBeyondCount: 1,
      },
    ];
    const allTasks = [
      {
        service: 'Service A',
        roleCategory: 'Ops',
        region: 'North',
        location: 'Leeds',
        taskName: 'Task A',
        assigneeId: 'user-1',
        assigneeName: 'User One',
      },
    ] as Task[];
    const filterOptions = {
      services: [],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      users: [],
    };

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks,
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: overview.assigned.length,
      completedTotalResults: overview.completed.length,
      completedComplianceSummary: {
        total: overview.completedSummary.total,
        withinDueYes: overview.completedSummary.withinDueYes,
        withinDueNo: overview.completedSummary.withinDueNo,
      },
      completedByDate,
      completedByTaskName,
      filterOptions,
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.assignedSummaryRows[0].key.text).toBe('Total assigned');
    expect(viewModel.assignedSummaryRows[1].key.text).toBe('Urgent');
    expect(viewModel.assignedRows[0].caseId).toBe('123');
    expect(viewModel.assignedRows[0].priority).toBe('Urgent');
    expect(viewModel.assignedRows[0].prioritySortValue).toBe(4);
    expect(viewModel.assignedRows[0].assigneeName).toBe('User One');
    expect(viewModel.completedSummaryRows[0].key.text).toBe('Completed');
    expect(viewModel.completedByDateRows[0][0].text).toBe('4 Jan 2024');
    expect(viewModel.completedByDateRows[0][0].attributes?.['data-sort-value']).toBe('2024-01-04');
    expect(viewModel.completedByDateRows[0][1].text).toBe('1');
    expect(viewModel.completedByDateRows[0][1].attributes?.['data-sort-value']).toBe('1');
    expect(viewModel.completedByDateRows[0][5].text).toBe('2.50');
    expect(viewModel.completedByDateTotalsRow[0].attributes?.['data-total-row']).toBe('true');
    expect(viewModel.completedByTaskNameRows[0][0].text).toBe('Task B');
    expect(viewModel.completedByTaskNameRows[0][1].text).toBe('1');
    expect(viewModel.completedByTaskNameRows[0][2].text).toBe('2.50');
    expect(viewModel.completedByTaskNameRows[0][3].text).toBe('1.00');
    expect(viewModel.completedByTaskNameTotalsRow[0].text).toBe('Total');
    expect(viewModel.completedByTaskNameTotalsRow[0].attributes?.['data-total-row']).toBe('true');
    expect(viewModel.assignedHead[1].attributes?.['data-sort-dir']).toBe('desc');
    expect(viewModel.assignedHead[0].attributes?.['data-sort-key']).toBe('caseId');
    expect(viewModel.assignedHead[0].text).toBe('Case ID');
    expect(viewModel.assignedPagination.page).toBe(1);
    expect(viewModel.completedPagination.page).toBe(1);
  });

  test('hydrates date picker values and default user options', () => {
    const overview: UserOverviewMetrics = {
      assigned: [],
      completed: [],
      prioritySummary: { urgent: 0, high: 0, medium: 0, low: 0 },
      completedSummary: { total: 0, withinDueYes: 0, withinDueNo: 0 },
      completedByDate: [],
    };

    const viewModel = buildUserOverviewViewModel({
      filters: {
        completedFrom: new Date('2024-02-01'),
        completedTo: new Date('2024-02-15'),
      },
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: overview.assigned.length,
      completedTotalResults: overview.completed.length,
      completedComplianceSummary: {
        total: overview.completedSummary.total,
        withinDueYes: overview.completedSummary.withinDueYes,
        withinDueNo: overview.completedSummary.withinDueNo,
      },
      completedByDate: [],
      completedByTaskName: [],
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.completedFromValue).toBe('01/02/2024');
    expect(viewModel.completedToValue).toBe('15/02/2024');
    expect(viewModel.userOptions[0].text).toBe('All users');
  });

  test('falls back when averages cannot be calculated', () => {
    const overview: UserOverviewMetrics = {
      assigned: [],
      completed: [],
      prioritySummary: { urgent: 0, high: 0, medium: 0, low: 0 },
      completedSummary: { total: 0, withinDueYes: 0, withinDueNo: 0 },
      completedByDate: [],
    };

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: overview.assigned.length,
      completedTotalResults: overview.completed.length,
      completedComplianceSummary: {
        total: overview.completedSummary.total,
        withinDueYes: overview.completedSummary.withinDueYes,
        withinDueNo: overview.completedSummary.withinDueNo,
      },
      completedByDate: [
        {
          date: '2024-01-05',
          tasks: 0,
          withinDue: 0,
          beyondDue: 0,
          handlingTimeSum: 0,
          handlingTimeCount: 0,
        },
      ],
      completedByTaskName: [
        {
          taskName: 'Task C',
          tasks: 1,
          handlingTimeSum: Number.NaN,
          handlingTimeCount: Number.NaN,
          daysBeyondSum: Number.NaN,
          daysBeyondCount: Number.NaN,
        },
      ],
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.completedByTaskNameTotalsRow[2].text).toBe('-');
    expect(viewModel.completedByTaskNameTotalsRow[3].text).toBe('-');
    expect(viewModel.completedByDateRows[0][3].text).toBe('0%');
    expect(viewModel.completedByDateTotalsRow[3].text).toBe('0%');
  });

  test('normalises non-number aggregate values before building averages', () => {
    const overview: UserOverviewMetrics = {
      assigned: [],
      completed: [],
      prioritySummary: { urgent: 0, high: 0, medium: 0, low: 0 },
      completedSummary: { total: 0, withinDueYes: 0, withinDueNo: 0 },
      completedByDate: [],
    };

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: 0,
      completedTotalResults: 0,
      completedComplianceSummary: {
        total: 0,
        withinDueYes: 0,
        withinDueNo: 0,
      },
      completedByDate: [],
      completedByTaskName: [
        {
          taskName: 'Task D',
          tasks: 2,
          handlingTimeSum: '4.5',
          handlingTimeCount: '2',
          daysBeyondSum: '3',
          daysBeyondCount: '2',
        } as unknown as {
          taskName: string;
          tasks: number;
          handlingTimeSum: number;
          handlingTimeCount: number;
          daysBeyondSum: number;
          daysBeyondCount: number;
        },
      ],
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.completedByTaskNameRows[0][2].text).toBe('2.25');
    expect(viewModel.completedByTaskNameRows[0][3].text).toBe('1.50');
  });

  test('uses provided user options and renders fallback dates', () => {
    const overview: UserOverviewMetrics = {
      assigned: [
        {
          caseId: '123',
          taskName: 'Task A',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: undefined,
          completedDate: undefined,
          priority: 'Urgent',
          totalAssignments: 1,
          assigneeName: undefined,
          location: 'Leeds',
          status: 'open',
        },
      ],
      completed: [
        {
          caseId: '456',
          taskName: 'Task B',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: '2024-01-03',
          completedDate: undefined,
          priority: 'High',
          totalAssignments: 2,
          location: 'London',
          status: 'completed',
        },
      ],
      prioritySummary: { urgent: 0, high: 1, medium: 0, low: 0 },
      completedSummary: { total: 1, withinDueYes: 0, withinDueNo: 1 },
      completedByDate: [],
    };
    const completedByDate = [
      { date: '2024-01-04', tasks: 2, withinDue: 0, beyondDue: 2, handlingTimeSum: 0, handlingTimeCount: 0 },
    ];

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: overview.assigned.length,
      completedTotalResults: overview.completed.length,
      completedComplianceSummary: {
        total: overview.completedSummary.total,
        withinDueYes: overview.completedSummary.withinDueYes,
        withinDueNo: overview.completedSummary.withinDueNo,
      },
      completedByDate,
      completedByTaskName: [],
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [{ value: 'user-1', text: 'User One' }],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.userOptions[0].value).toBe('user-1');
    expect(viewModel.assignedRows[0].dueDate).toBe('-');
    expect(viewModel.completedRows[0].completedDate).toBe('-');
  });

  test('renders placeholders when no days beyond values are provided', () => {
    const overview: UserOverviewMetrics = {
      assigned: [],
      completed: [
        {
          caseId: '789',
          taskName: 'Task C',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: 'invalid-date',
          completedDate: 'invalid-date',
          priority: 'Low',
          totalAssignments: 1,
          assigneeName: 'User Three',
          location: 'Leeds',
          status: 'completed',
        },
      ],
      prioritySummary: { urgent: 0, high: 0, medium: 0, low: 1 },
      completedSummary: { total: 1, withinDueYes: 0, withinDueNo: 1 },
      completedByDate: [],
    };
    const completedByTaskName = [
      {
        taskName: 'Task C',
        tasks: 1,
        handlingTimeSum: 0,
        handlingTimeCount: 0,
        daysBeyondSum: 0,
        daysBeyondCount: 0,
      },
    ];

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: overview.assigned.length,
      completedTotalResults: overview.completed.length,
      completedComplianceSummary: {
        total: overview.completedSummary.total,
        withinDueYes: overview.completedSummary.withinDueYes,
        withinDueNo: overview.completedSummary.withinDueNo,
      },
      completedByDate: [],
      completedByTaskName,
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.completedByTaskNameRows[0][3].text).toBe('-');
  });

  test('renders fallback dates and sorts completed task names', () => {
    const overview: UserOverviewMetrics = {
      assigned: [
        {
          caseId: '111',
          taskName: 'Task Z',
          createdDate: '2024-01-01',
          assignedDate: undefined,
          dueDate: undefined,
          completedDate: undefined,
          priority: 'Low',
          totalAssignments: 1,
          assigneeName: undefined,
          location: 'Leeds',
          status: 'open',
        },
      ],
      completed: [
        {
          caseId: '222',
          taskName: 'Task B',
          createdDate: '2024-01-02',
          assignedDate: undefined,
          dueDate: undefined,
          completedDate: '2024-01-03',
          priority: 'High',
          totalAssignments: 1,
          assigneeName: 'User',
          location: 'Leeds',
          status: 'completed',
          withinDue: false,
        },
        {
          caseId: '333',
          taskName: 'Task A',
          createdDate: '2024-01-02',
          assignedDate: undefined,
          dueDate: undefined,
          completedDate: '2024-01-03',
          priority: 'High',
          totalAssignments: 1,
          assigneeName: 'User',
          location: 'Leeds',
          status: 'completed',
          withinDue: true,
        },
      ],
      prioritySummary: { urgent: 0, high: 2, medium: 0, low: 1 },
      completedSummary: { total: 2, withinDueYes: 1, withinDueNo: 1 },
      completedByDate: [],
    };
    const completedByDate = [
      { date: '2024-01-03', tasks: 0, withinDue: 0, beyondDue: 0, handlingTimeSum: 0, handlingTimeCount: 0 },
    ];
    const completedByTaskName = [
      {
        taskName: 'Task B',
        tasks: 2,
        handlingTimeSum: 0,
        handlingTimeCount: 0,
        daysBeyondSum: 0,
        daysBeyondCount: 0,
      },
      {
        taskName: 'Task A',
        tasks: 2,
        handlingTimeSum: 0,
        handlingTimeCount: 0,
        daysBeyondSum: 0,
        daysBeyondCount: 0,
      },
    ];

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: overview.assigned.length,
      completedTotalResults: overview.completed.length,
      completedComplianceSummary: {
        total: overview.completedSummary.total,
        withinDueYes: overview.completedSummary.withinDueYes,
        withinDueNo: overview.completedSummary.withinDueNo,
      },
      completedByDate,
      completedByTaskName,
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.assignedRows[0].assignedDate).toBe('-');
    expect(viewModel.assignedRows[0].dueDate).toBe('-');
    expect(viewModel.completedRows[0].assignedDate).toBe('-');
    expect(viewModel.completedRows[0].dueDate).toBe('-');
    expect(viewModel.completedRows[0].withinDue).toBe('No');
    expect(viewModel.completedByTaskNameRows[0][0].text).toBe('Task A');
    expect(viewModel.completedByDateRows[0][3].text).toBe('0%');
  });

  test('formats totals and within-sla placeholders in task rows', () => {
    const overview: UserOverviewMetrics = {
      assigned: [
        {
          caseId: 'A1',
          taskName: 'Task A',
          createdDate: '2024-01-01',
          assignedDate: undefined,
          dueDate: undefined,
          completedDate: undefined,
          priority: 'Low',
          totalAssignments: 0,
          assigneeName: undefined,
          location: 'Leeds',
          status: 'open',
        },
      ],
      completed: [
        {
          caseId: 'C1',
          taskName: 'Task C',
          createdDate: '2024-01-01',
          assignedDate: undefined,
          dueDate: undefined,
          completedDate: undefined,
          priority: 'High',
          totalAssignments: 0,
          assigneeName: undefined,
          location: 'Leeds',
          withinDue: null,
          status: 'completed',
        },
      ],
      prioritySummary: { urgent: 0, high: 0, medium: 0, low: 1 },
      completedSummary: { total: 1, withinDueYes: 0, withinDueNo: 1 },
      completedByDate: [],
    };

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: overview.assigned.length,
      completedTotalResults: overview.completed.length,
      completedComplianceSummary: {
        total: overview.completedSummary.total,
        withinDueYes: overview.completedSummary.withinDueYes,
        withinDueNo: overview.completedSummary.withinDueNo,
      },
      completedByDate: [],
      completedByTaskName: [],
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.assignedRows[0].totalAssignments).toBe('0');
    expect(viewModel.completedRows[0].withinDue).toBe('-');
    expect(viewModel.completedRows[0].totalAssignments).toBe('0');
  });

  test('formats percent cells via helper', () => {
    const { buildPercentCell } = __testing;

    expect(buildPercentCell(33.3, { minimumFractionDigits: 1 }).text).toContain('33');
    expect(buildPercentCell(33.3, { minimumFractionDigits: 1 }).attributes?.['data-sort-value']).toBe('33.3');
    jest.isolateModules(() => {
      const { __testing: isolated } = require('../../../../main/modules/analytics/userOverview/viewModel');
      const helperCell = isolated.buildPercentCell(10);
      expect(helperCell.text).toContain('10');
      expect(helperCell.attributes?.['data-sort-value']).toBe('10');
    });
  });

  test('formats total assignment counts for assigned and completed rows', () => {
    const overview: UserOverviewMetrics = {
      assigned: [
        {
          caseId: '900',
          taskName: 'Task A',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: '2024-01-03',
          completedDate: undefined,
          priority: 'Urgent',
          totalAssignments: 3,
          assigneeName: 'User A',
          location: 'Leeds',
          status: 'open',
        },
      ],
      completed: [
        {
          caseId: '901',
          taskName: 'Task B',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: '2024-01-03',
          completedDate: '2024-01-04',
          priority: 'High',
          totalAssignments: 2,
          assigneeName: 'User B',
          location: 'Leeds',
          status: 'completed',
          withinDue: true,
        },
      ],
      prioritySummary: { urgent: 1, high: 1, medium: 0, low: 0 },
      completedSummary: { total: 1, withinDueYes: 1, withinDueNo: 0 },
      completedByDate: [],
    };

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: overview.assigned.length,
      completedTotalResults: overview.completed.length,
      completedComplianceSummary: {
        total: overview.completedSummary.total,
        withinDueYes: overview.completedSummary.withinDueYes,
        withinDueNo: overview.completedSummary.withinDueNo,
      },
      completedByDate: [],
      completedByTaskName: [],
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.assignedRows[0].totalAssignments).toBe('3');
    expect(viewModel.completedRows[0].totalAssignments).toBe('2');
  });

  test('maps assigned and completed rows via helpers', () => {
    const { mapAssignedRow, mapCompletedRow } = __testing;
    const locationDescriptions = { Leeds: 'Leeds Crown Court' };
    const baseTask = {
      caseId: '1000',
      taskId: '1000',
      service: 'Service',
      roleCategory: 'Role',
      region: 'Region',
      location: 'Leeds',
      taskName: 'Task Z',
      priority: 'Low',
      status: 'assigned' as TaskStatus,
      createdDate: '2024-01-01',
      assignedDate: '2024-01-02',
      dueDate: '2024-01-03',
      completedDate: '2024-01-04',
      handlingTimeDays: 1.5,
      totalAssignments: 1,
      assigneeName: 'User',
      withinSla: true,
    } as Task;

    expect(mapAssignedRow(baseTask, locationDescriptions).totalAssignments).toBe('1');
    expect(mapAssignedRow(baseTask, locationDescriptions).location).toBe('Leeds Crown Court');
    expect(mapAssignedRow(baseTask, locationDescriptions).priority).toBe('Low');
    expect(mapAssignedRow(baseTask, locationDescriptions).prioritySortValue).toBe(1);

    const missingCreatedDateTask = { ...baseTask, createdDate: undefined as unknown as string };
    expect(mapAssignedRow(missingCreatedDateTask, locationDescriptions).createdDateRaw).toBe('-');
    expect(mapCompletedRow(missingCreatedDateTask, locationDescriptions).createdDateRaw).toBe('-');

    const completedRow = mapCompletedRow(baseTask, locationDescriptions);
    expect(completedRow.handlingTimeDays).toBe('1.50');
    expect(completedRow.withinDue).toBe('Yes');

    jest.isolateModules(() => {
      const { __testing: isolated } = require('../../../../main/modules/analytics/userOverview/viewModel');
      expect(isolated.mapAssignedRow(baseTask, locationDescriptions).totalAssignments).toBe('1');
      expect(isolated.mapAssignedRow(baseTask, locationDescriptions).priority).toBe('Low');
      expect(isolated.mapAssignedRow(baseTask, locationDescriptions).prioritySortValue).toBe(1);
      expect(isolated.mapCompletedRow(baseTask, locationDescriptions).totalAssignments).toBe('1');
      const nullAssignments = { ...baseTask, totalAssignments: undefined };
      expect(isolated.mapAssignedRow(nullAssignments, locationDescriptions).totalAssignments).toBe('0');
      expect(isolated.mapCompletedRow(nullAssignments, locationDescriptions).totalAssignments).toBe('0');
    });
  });

  test('renders complete table heads and aggregate totals', () => {
    const overview: UserOverviewMetrics = {
      assigned: [
        {
          caseId: 'A-100',
          taskName: 'Task Z',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: '2024-01-03',
          completedDate: undefined,
          priority: 'Urgent',
          totalAssignments: 2,
          assigneeName: 'User A',
          location: 'Leeds',
          status: 'open',
        },
      ],
      completed: [
        {
          caseId: 'C-100',
          taskName: 'Task Y',
          createdDate: '2024-01-01',
          assignedDate: '2024-01-02',
          dueDate: '2024-01-03',
          completedDate: '2024-01-04',
          priority: 'High',
          totalAssignments: 1,
          assigneeName: 'User B',
          location: 'London',
          handlingTimeDays: 2.5,
          withinDue: true,
          status: 'completed',
        },
      ],
      prioritySummary: { urgent: 1, high: 1, medium: 0, low: 0 },
      completedSummary: { total: 2, withinDueYes: 1, withinDueNo: 1 },
      completedByDate: [],
    };

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: 1,
      completedTotalResults: 1,
      completedComplianceSummary: {
        total: 2,
        withinDueYes: 1,
        withinDueNo: 1,
      },
      completedByDate: [
        { date: '2024-01-04', tasks: 3, withinDue: 2, beyondDue: 1, handlingTimeSum: 9, handlingTimeCount: 3 },
        { date: '2024-01-05', tasks: 1, withinDue: 1, beyondDue: 0, handlingTimeSum: 2, handlingTimeCount: 1 },
      ],
      completedByTaskName: [
        {
          taskName: 'Gamma',
          tasks: 2,
          handlingTimeSum: 6,
          handlingTimeCount: 2,
          daysBeyondSum: 4,
          daysBeyondCount: 2,
        },
        {
          taskName: 'Alpha',
          tasks: 2,
          handlingTimeSum: 1,
          handlingTimeCount: 1,
          daysBeyondSum: 0,
          daysBeyondCount: 1,
        },
      ],
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [{ value: 'user-1', text: 'User One' }],
      },
      locationDescriptions: { Leeds: 'Leeds Crown Court' },
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.userOptions).toEqual([{ value: 'user-1', text: 'User One' }]);
    expect(viewModel.assignedHead.map(cell => cell.text)).toEqual([
      'Case ID',
      'Created date',
      'Task name',
      'Assigned date',
      'Due date',
      'Priority',
      'Total assignments',
      'Assignee',
      'Location',
    ]);
    expect(viewModel.completedHead.map(cell => cell.text)).toEqual([
      'Case ID',
      'Created date',
      'Task name',
      'Assigned date',
      'Due date',
      'Completed date',
      'Handling time (days)',
      'Within due date',
      'Total assignments',
      'Assignee',
      'Location',
    ]);
    expect(viewModel.assignedHead.map(cell => cell.attributes?.['data-sort-key'])).toEqual([
      'caseId',
      'createdDate',
      'taskName',
      'assignedDate',
      'dueDate',
      'priority',
      'totalAssignments',
      'assignee',
      'location',
    ]);
    expect(viewModel.completedHead.map(cell => cell.attributes?.['data-sort-key'])).toEqual([
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
    ]);

    expect(viewModel.completedSummaryRows[0].key.text).toBe('Completed');
    expect(viewModel.completedSummaryRows[1].key.text).toBe('Within due date');
    expect(viewModel.completedSummaryRows[2].key.text).toBe('Beyond due date');
    expect(viewModel.assignedRows[0].location).toBe('Leeds Crown Court');

    expect(viewModel.completedByTaskNameRows[0][0].text).toBe('Alpha');
    expect(viewModel.completedByTaskNameRows[1][0].text).toBe('Gamma');
    expect(viewModel.completedByTaskNameTotalsRow[1].text).toBe('4');
    expect(viewModel.completedByTaskNameTotalsRow[2].text).toBe('2.33');
    expect(viewModel.completedByTaskNameTotalsRow[3].text).toBe('1.33');

    expect(viewModel.completedByDateRows[0][5].text).toBe('3.00');
    expect(viewModel.completedByDateRows[1][5].text).toBe('2.00');
    expect(viewModel.completedByDateTotalsRow[1].text).toBe('4');
    expect(viewModel.completedByDateTotalsRow[2].text).toBe('3');
    expect(viewModel.completedByDateTotalsRow[3].text).toContain('75');
    expect(viewModel.completedByDateTotalsRow[4].text).toBe('1');
    expect(viewModel.completedByDateTotalsRow[5].text).toBe('2.75');
  });

  test('uses placeholder and unknown-label defaults in mapped rows and aggregates', () => {
    const overview: UserOverviewMetrics = {
      assigned: [
        {
          caseId: 'A-200',
          taskName: 'Task A',
          createdDate: '2024-02-01',
          assignedDate: undefined,
          dueDate: undefined,
          completedDate: undefined,
          priority: 'Low',
          totalAssignments: 0,
          assigneeName: undefined,
          location: 'Leeds',
          status: 'open',
        },
      ],
      completed: [
        {
          caseId: 'C-200',
          taskName: 'Task B',
          createdDate: '2024-02-01',
          assignedDate: undefined,
          dueDate: undefined,
          completedDate: undefined,
          priority: 'Medium',
          totalAssignments: 0,
          assigneeName: undefined,
          location: 'Leeds',
          handlingTimeDays: undefined,
          withinDue: undefined,
          status: 'completed',
        },
      ],
      prioritySummary: { urgent: 0, high: 0, medium: 1, low: 1 },
      completedSummary: { total: 3, withinDueYes: 2, withinDueNo: 1 },
      completedByDate: [],
    };

    const viewModel = buildUserOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview,
      allTasks: [],
      assignedTasks: buildTasks(overview.assigned, 'assigned'),
      completedTasks: buildTasks(overview.completed, 'completed'),
      assignedTotalResults: 1,
      completedTotalResults: 1,
      completedComplianceSummary: { total: 3, withinDueYes: 2, withinDueNo: 1 },
      completedByDate: [
        { date: '2024-02-02', tasks: 3, withinDue: 2, beyondDue: 1, handlingTimeSum: 4, handlingTimeCount: 2 },
      ],
      completedByTaskName: [
        {
          taskName: '',
          tasks: 3,
          handlingTimeSum: 6,
          handlingTimeCount: 3,
          daysBeyondSum: 2,
          daysBeyondCount: 3,
        },
      ],
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      locationDescriptions: {},
      sort: getDefaultUserOverviewSort(),
      assignedPage: 1,
      completedPage: 1,
    });

    expect(viewModel.userOptions).toEqual([{ value: '', text: 'All users' }]);
    expect(viewModel.assignedRows[0].assigneeName).toBe('');
    expect(viewModel.completedRows[0].assigneeName).toBe('');
    expect(viewModel.completedRows[0].handlingTimeDays).toBe('-');
    expect(viewModel.completedRows[0].withinDue).toBe('-');
    expect(viewModel.assignedHead[6].format).toBe('numeric');
    expect(viewModel.completedHead[8].format).toBe('numeric');
    expect(viewModel.completedByTaskNameRows[0][0].text).toBe('Unknown');
    expect(viewModel.completedByDateRows[0][3].text).toBe('66.7%');
    expect(viewModel.completedByDateRows[0][3].attributes?.['data-sort-value']).toBe(String((2 / 3) * 100));
    expect(viewModel.completedByDateTotalsRow[0].text).toBe('Total');
    expect(viewModel.completedByDateTotalsRow[3].text).toBe('66.7%');
    expect(viewModel.completedByDateTotalsRow[3].attributes?.['data-sort-value']).toBe(String((2 / 3) * 100));
  });
});
