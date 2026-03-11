import { completedComplianceSummaryService } from '../../../../main/modules/analytics/completed/visuals/completedComplianceSummaryService';
import {
  fetchFacetedFilterStateWithFallback as fetchFilterOptionsWithFallback,
  fetchPublishedSnapshotContext,
} from '../../../../main/modules/analytics/shared/pageUtils';
import { taskFactsRepository, taskThinRepository } from '../../../../main/modules/analytics/shared/repositories';
import { caseWorkerProfileService, courtVenueService } from '../../../../main/modules/analytics/shared/services';
import { getDefaultUserOverviewSort } from '../../../../main/modules/analytics/shared/userOverviewSort';
import { buildUserOverviewPage } from '../../../../main/modules/analytics/userOverview/page';
import { userOverviewService } from '../../../../main/modules/analytics/userOverview/service';
import { buildUserOverviewViewModel } from '../../../../main/modules/analytics/userOverview/viewModel';

jest.mock('../../../../main/modules/analytics/userOverview/service', () => ({
  userOverviewService: { buildUserOverview: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/userOverview/viewModel', () => ({
  buildUserOverviewViewModel: jest.fn(),
}));

jest.mock('../../../../main/modules/analytics/shared/pageUtils', () => ({
  fetchFacetedFilterStateWithFallback: jest.fn(),
  fetchPublishedSnapshotContext: jest.fn(),
  normaliseDateRange: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils').normaliseDateRange,
  settledValueWithFallback: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils')
    .settledValueWithFallback,
  settledArrayWithFallback: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils')
    .settledArrayWithFallback,
}));

jest.mock('../../../../main/modules/analytics/shared/services', () => ({
  caseWorkerProfileService: { fetchCaseWorkerProfileNames: jest.fn() },
  courtVenueService: { fetchCourtVenueDescriptions: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/shared/repositories', () => ({
  taskFactsRepository: {
    fetchUserOverviewCompletedTaskCount: jest.fn(),
  },
  taskThinRepository: {
    fetchUserOverviewAssignedTaskRows: jest.fn(),
    fetchUserOverviewCompletedTaskRows: jest.fn(),
    fetchUserOverviewAssignedTaskCount: jest.fn(),
    fetchUserOverviewCompletedByDateRows: jest.fn(),
    fetchUserOverviewCompletedByTaskNameRows: jest.fn(),
  },
}));

jest.mock('../../../../main/modules/analytics/completed/visuals/completedComplianceSummaryService', () => ({
  completedComplianceSummaryService: { fetchCompletedSummary: jest.fn() },
}));

describe('buildUserOverviewPage', () => {
  const snapshotId = 104;
  const userOverviewQueryOptions = { excludeRoleCategories: ['Judicial'] };
  const buildDefaultUserOverviewAggregate = () => ({
    assigned: [],
    completed: [],
    prioritySummary: { urgent: 0, high: 0, medium: 0, low: 0 },
    completedSummary: { total: 0, withinDueYes: 0, withinDueNo: 0 },
    completedByDate: [],
  });
  const mockDefaultUserOverviewAggregate = () => {
    (userOverviewService.buildUserOverview as jest.Mock).mockReturnValue(buildDefaultUserOverviewAggregate());
  };
  const buildDefaultUserOverviewFilterState = () => ({
    filters: {},
    filterOptions: {
      services: [],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      users: [],
    },
  });
  const mockDefaultUserOverviewFilterState = () => {
    (fetchFilterOptionsWithFallback as jest.Mock).mockResolvedValue(buildDefaultUserOverviewFilterState());
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchPublishedSnapshotContext as jest.Mock).mockResolvedValue({
      snapshotId,
      publishedAt: new Date('2026-02-17T10:15:00.000Z'),
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
    });
    (taskThinRepository.fetchUserOverviewAssignedTaskCount as jest.Mock).mockResolvedValue(0);
    (taskFactsRepository.fetchUserOverviewCompletedTaskCount as jest.Mock).mockResolvedValue(0);
  });

  test('builds the assigned partial view model with filters and options', async () => {
    const sort = getDefaultUserOverviewSort();
    const assignedRows = [
      {
        case_id: 'CASE-1',
        task_id: 'CASE-1',
        task_name: 'Review',
        jurisdiction_label: 'Service A',
        role_category_label: 'Ops',
        region: 'North',
        location: 'Leeds',
        created_date: '2024-01-01',
        first_assigned_date: '2024-01-02',
        due_date: '2024-01-03',
        completed_date: null,
        handling_time_days: null,
        is_within_sla: null,
        priority_rank: 4,
        assignee: 'user-1',
        number_of_reassignments: 0,
      },
      {
        case_id: 'CASE-3',
        task_id: 'CASE-3',
        task_name: 'Check',
        jurisdiction_label: 'Service A',
        role_category_label: 'Ops',
        region: 'North',
        location: 'Leeds',
        created_date: '2024-01-05',
        first_assigned_date: '2024-01-06',
        due_date: '2024-01-07',
        completed_date: null,
        handling_time_days: null,
        is_within_sla: null,
        priority_rank: 1,
        assignee: 'user-2',
        number_of_reassignments: 0,
      },
    ];
    (taskThinRepository.fetchUserOverviewAssignedTaskCount as jest.Mock).mockResolvedValue(2);
    (taskThinRepository.fetchUserOverviewAssignedTaskRows as jest.Mock).mockResolvedValue(assignedRows);
    mockDefaultUserOverviewAggregate();
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({ Leeds: 'Leeds Crown Court' });
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({
      'user-1': 'Sam Taylor',
    });
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview' });

    const viewModel = await buildUserOverviewPage({ user: ['user-1'] }, sort, 1, 1, 'user-overview-assigned');

    expect(taskThinRepository.fetchUserOverviewAssignedTaskRows).toHaveBeenCalledWith(
      snapshotId,
      { user: ['user-1'] },
      sort.assigned,
      { page: 1, pageSize: 50 },
      userOverviewQueryOptions
    );
    expect(taskThinRepository.fetchUserOverviewAssignedTaskRows).toHaveBeenCalledWith(
      snapshotId,
      { user: ['user-1'] },
      sort.assigned,
      null,
      userOverviewQueryOptions
    );
    expect(taskThinRepository.fetchUserOverviewCompletedTaskRows).not.toHaveBeenCalled();
    expect(taskThinRepository.fetchUserOverviewCompletedByDateRows).not.toHaveBeenCalled();
    expect(taskThinRepository.fetchUserOverviewCompletedByTaskNameRows).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).not.toHaveBeenCalled();
    expect(userOverviewService.buildUserOverview).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: 'CASE-1',
          assignedDate: '2024-01-02',
          priority: 'Urgent',
          status: 'assigned',
          totalAssignments: 1,
          assigneeName: 'Sam Taylor',
        }),
        expect.objectContaining({
          caseId: 'CASE-3',
          assignedDate: '2024-01-06',
          status: 'assigned',
          totalAssignments: 1,
          assigneeName: 'user-2',
        }),
      ])
    );
    expect(buildUserOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { user: ['user-1'] },
        locationDescriptions: { Leeds: 'Leeds Crown Court' },
        sort,
        assignedPage: 1,
        completedPage: 1,
        assignedTasks: expect.any(Array),
        completedTasks: expect.any(Array),
        completedByDate: expect.any(Array),
        completedByTaskName: expect.any(Array),
        assignedTotalResults: 2,
      })
    );
    expect(viewModel).toEqual({ view: 'user-overview' });
  });

  test('builds the full page view model with deferred sections', async () => {
    const sort = getDefaultUserOverviewSort();

    mockDefaultUserOverviewFilterState();
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview-full' });

    const viewModel = await buildUserOverviewPage({ user: ['user-1'] }, sort);

    expect(taskThinRepository.fetchUserOverviewAssignedTaskRows).not.toHaveBeenCalled();
    expect(taskThinRepository.fetchUserOverviewCompletedTaskRows).not.toHaveBeenCalled();
    expect(taskThinRepository.fetchUserOverviewCompletedByDateRows).not.toHaveBeenCalled();
    expect(taskThinRepository.fetchUserOverviewCompletedByTaskNameRows).not.toHaveBeenCalled();
    expect(taskThinRepository.fetchUserOverviewAssignedTaskCount).not.toHaveBeenCalled();
    expect(taskFactsRepository.fetchUserOverviewCompletedTaskCount).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Failed to fetch user overview filter options from database',
        snapshotId,
        queryOptions: userOverviewQueryOptions,
      })
    );
    expect(viewModel).toEqual({ view: 'user-overview-full' });
  });

  test('treats unknown ajax sections as full-page requests', async () => {
    const sort = getDefaultUserOverviewSort();
    mockDefaultUserOverviewFilterState();
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview-unknown' });

    const viewModel = await buildUserOverviewPage({}, sort, 1, 1, 'unknown-section');

    expect(taskThinRepository.fetchUserOverviewAssignedTaskCount).not.toHaveBeenCalled();
    expect(taskFactsRepository.fetchUserOverviewCompletedTaskCount).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Failed to fetch user overview filter options from database',
        snapshotId,
        queryOptions: userOverviewQueryOptions,
      })
    );
    expect(viewModel).toEqual({ view: 'user-overview-unknown' });
  });

  test('supports legacy assigned ajax section alias', async () => {
    const sort = getDefaultUserOverviewSort();
    (taskThinRepository.fetchUserOverviewAssignedTaskCount as jest.Mock).mockResolvedValue(1);
    (taskThinRepository.fetchUserOverviewAssignedTaskRows as jest.Mock).mockResolvedValue([]);
    mockDefaultUserOverviewAggregate();
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({});
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({});
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview-assigned-alias' });

    await buildUserOverviewPage({}, sort, 1, 1, 'assigned');

    expect(taskThinRepository.fetchUserOverviewAssignedTaskCount).toHaveBeenCalledWith(
      snapshotId,
      {},
      userOverviewQueryOptions
    );
    expect(taskThinRepository.fetchUserOverviewAssignedTaskRows).toHaveBeenCalledWith(
      snapshotId,
      {},
      sort.assigned,
      {
        page: 1,
        pageSize: 50,
      },
      userOverviewQueryOptions
    );
    expect(taskThinRepository.fetchUserOverviewCompletedTaskRows).not.toHaveBeenCalled();
  });

  test('supports legacy completed ajax section alias and clamps oversized pages', async () => {
    const sort = getDefaultUserOverviewSort();
    (taskFactsRepository.fetchUserOverviewCompletedTaskCount as jest.Mock).mockResolvedValue(20000);
    (taskThinRepository.fetchUserOverviewCompletedTaskRows as jest.Mock).mockResolvedValue([
      {
        case_id: 'CASE-2',
        task_id: 'CASE-2',
        task_name: 'Validate',
        jurisdiction_label: 'Service B',
        role_category_label: 'Ops',
        region: 'South',
        location: 'Leeds',
        created_date: '2024-01-01',
        first_assigned_date: '2024-01-02',
        due_date: '2024-01-03',
        completed_date: '2024-01-04',
        handling_time_days: 2,
        is_within_sla: 'Yes',
        priority_rank: 3,
        assignee: 'user-1',
        number_of_reassignments: 0,
      },
    ]);
    (taskThinRepository.fetchUserOverviewCompletedByDateRows as jest.Mock).mockResolvedValue([]);
    (completedComplianceSummaryService.fetchCompletedSummary as jest.Mock).mockResolvedValue({
      total: 1,
      within: 1,
    });
    mockDefaultUserOverviewAggregate();
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({});
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({
      'user-1': 'Sam Taylor',
    });
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview-completed-alias' });

    await buildUserOverviewPage({}, sort, 1, 999, 'completed');

    expect(taskFactsRepository.fetchUserOverviewCompletedTaskCount).toHaveBeenCalledWith(
      snapshotId,
      {},
      userOverviewQueryOptions
    );
    expect(taskThinRepository.fetchUserOverviewCompletedTaskRows).toHaveBeenCalledWith(
      snapshotId,
      {},
      sort.completed,
      {
        page: 10,
        pageSize: 50,
      },
      userOverviewQueryOptions
    );
    expect(completedComplianceSummaryService.fetchCompletedSummary).toHaveBeenCalledWith(
      snapshotId,
      {},
      undefined,
      userOverviewQueryOptions
    );
    expect(taskThinRepository.fetchUserOverviewCompletedByDateRows).not.toHaveBeenCalled();
    expect(buildUserOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completedPage: 10,
        completedTasks: [expect.objectContaining({ withinSla: true, status: 'completed' })],
        completedComplianceSummary: { total: 1, withinDueYes: 1, withinDueNo: 0 },
      })
    );
  });

  test('clamps oversized assigned page requests to the 500-result window', async () => {
    const sort = getDefaultUserOverviewSort();
    (taskThinRepository.fetchUserOverviewAssignedTaskCount as jest.Mock).mockResolvedValue(20000);
    (taskThinRepository.fetchUserOverviewAssignedTaskRows as jest.Mock).mockResolvedValue([]);
    mockDefaultUserOverviewAggregate();
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({});
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({});
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview-clamped' });

    await buildUserOverviewPage({}, sort, 999, 1, 'user-overview-assigned');

    expect(taskThinRepository.fetchUserOverviewAssignedTaskRows).toHaveBeenNthCalledWith(
      1,
      snapshotId,
      {},
      sort.assigned,
      {
        page: 10,
        pageSize: 50,
      },
      userOverviewQueryOptions
    );
    expect(buildUserOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedPage: 10,
        assignedTotalResults: 20000,
      })
    );
  });

  test('maps optional fields when building tasks', async () => {
    const sort = getDefaultUserOverviewSort();
    const assignedRows = [
      {
        case_id: 'CASE-10',
        task_id: 'CASE-10',
        task_name: null,
        jurisdiction_label: null,
        role_category_label: null,
        region: null,
        location: null,
        created_date: null,
        first_assigned_date: null,
        due_date: null,
        completed_date: null,
        handling_time_days: null,
        is_within_sla: 'No',
        priority_rank: 2,
        assignee: null,
        number_of_reassignments: null,
      },
    ];
    (taskThinRepository.fetchUserOverviewAssignedTaskRows as jest.Mock).mockResolvedValue(assignedRows);
    (taskThinRepository.fetchUserOverviewCompletedTaskRows as jest.Mock).mockResolvedValue([]);
    (taskThinRepository.fetchUserOverviewCompletedByDateRows as jest.Mock).mockResolvedValue([]);
    (taskThinRepository.fetchUserOverviewCompletedByTaskNameRows as jest.Mock).mockResolvedValue([]);
    mockDefaultUserOverviewAggregate();
    mockDefaultUserOverviewFilterState();
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({});
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({});
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview' });

    await buildUserOverviewPage({}, sort, 1, 1, 'user-overview-assigned');

    expect(userOverviewService.buildUserOverview).toHaveBeenCalledWith([
      expect.objectContaining({
        caseId: 'CASE-10',
        service: '',
        roleCategory: '',
        region: '',
        location: '',
        taskName: '',
        createdDate: '-',
        withinSla: false,
        assigneeName: undefined,
        totalAssignments: 1,
      }),
    ]);
  });

  test('defaults missing aggregates when mapping completed summaries', async () => {
    const sort = getDefaultUserOverviewSort();

    (taskThinRepository.fetchUserOverviewAssignedTaskRows as jest.Mock).mockResolvedValue([]);
    (taskThinRepository.fetchUserOverviewCompletedTaskRows as jest.Mock).mockResolvedValue([]);
    (taskThinRepository.fetchUserOverviewCompletedByDateRows as jest.Mock).mockResolvedValue([
      {
        date_key: '2024-03-01',
        tasks: 1,
        within_due: 1,
        beyond_due: 0,
        handling_time_sum: null,
        handling_time_count: 0,
      },
    ]);
    (completedComplianceSummaryService.fetchCompletedSummary as jest.Mock).mockResolvedValue({ total: 1, within: 1 });
    mockDefaultUserOverviewAggregate();
    mockDefaultUserOverviewFilterState();
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({});
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({});
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview-defaults' });

    await buildUserOverviewPage({}, sort, 1, 1, 'user-overview-completed-by-date');

    expect(buildUserOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completedByDate: [expect.objectContaining({ handlingTimeSum: 0 })],
      })
    );
  });

  test('defaults missing aggregates when mapping completed by task name', async () => {
    const sort = getDefaultUserOverviewSort();

    (taskThinRepository.fetchUserOverviewCompletedByTaskNameRows as jest.Mock).mockResolvedValue([
      {
        task_name: null,
        tasks: 1,
        handling_time_sum: null,
        handling_time_count: 0,
        days_beyond_sum: null,
        days_beyond_count: 0,
      },
    ]);
    mockDefaultUserOverviewAggregate();
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview-task-name' });

    await buildUserOverviewPage({}, sort, 1, 1, 'user-overview-completed-by-task-name');

    expect(buildUserOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completedByTaskName: [expect.objectContaining({ taskName: 'Unknown', handlingTimeSum: 0, daysBeyondSum: 0 })],
      })
    );
  });

  test('derives compliance summary from completed-by-date totals when compliance is missing', async () => {
    const sort = getDefaultUserOverviewSort();

    (taskThinRepository.fetchUserOverviewAssignedTaskRows as jest.Mock).mockResolvedValue([]);
    (taskThinRepository.fetchUserOverviewCompletedTaskRows as jest.Mock).mockResolvedValue([]);
    (taskThinRepository.fetchUserOverviewCompletedByDateRows as jest.Mock).mockResolvedValue([
      {
        date_key: '2024-02-10',
        tasks: 4,
        within_due: 3,
        beyond_due: 1,
        handling_time_sum: 0,
        handling_time_count: 0,
      },
    ]);
    (taskThinRepository.fetchUserOverviewCompletedByTaskNameRows as jest.Mock).mockResolvedValue([]);
    (completedComplianceSummaryService.fetchCompletedSummary as jest.Mock).mockResolvedValue(null);
    mockDefaultUserOverviewAggregate();
    mockDefaultUserOverviewFilterState();
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({});
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({});
    (buildUserOverviewViewModel as jest.Mock).mockReturnValue({ view: 'user-overview-compliance' });

    await buildUserOverviewPage({}, sort, 1, 1, 'user-overview-completed-by-date');

    expect(buildUserOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completedComplianceSummary: { total: 4, withinDueYes: 3, withinDueNo: 1 },
      })
    );
  });
});
