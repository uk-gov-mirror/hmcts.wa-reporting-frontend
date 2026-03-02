import { openTasksCreatedByAssignmentChartService } from '../../../../../main/modules/analytics/outstanding/visuals/openTasksCreatedByAssignmentChartService';
import { taskFactsRepository } from '../../../../../main/modules/analytics/shared/repositories';

jest.mock('../../../../../main/modules/analytics/shared/repositories', () => ({
  taskFactsRepository: { fetchOpenTasksCreatedByAssignmentRows: jest.fn() },
}));

describe('openTasksCreatedByAssignmentChartService', () => {
  const snapshotId = 306;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('builds series points and percentages by assignment state', async () => {
    const filters = {};
    (taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows as jest.Mock).mockResolvedValue([
      { date_key: '2024-01-02', assignment_state: 'Assigned', total: 3 },
      { date_key: '2024-01-02', assignment_state: 'Unassigned', total: 1 },
      { date_key: '2024-01-01', assignment_state: 'Assigned', total: 2 },
      { date_key: '2024-01-01', assignment_state: 'Unknown', total: 5 },
    ]);

    const result = await openTasksCreatedByAssignmentChartService.fetchOpenTasksCreatedByAssignment(
      snapshotId,
      filters
    );

    expect(taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows).toHaveBeenCalledWith(snapshotId, filters);
    expect(result).toEqual([
      { date: '2024-01-01', open: 2, assigned: 2, unassigned: 0, assignedPct: 100, unassignedPct: 0 },
      { date: '2024-01-02', open: 4, assigned: 3, unassigned: 1, assignedPct: 75, unassignedPct: 25 },
    ]);
  });

  test('returns zero percentages when open count is zero', async () => {
    const filters = {};
    (taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows as jest.Mock).mockResolvedValue([
      { date_key: '2024-01-03', assignment_state: 'Assigned', total: 0 },
    ]);

    const result = await openTasksCreatedByAssignmentChartService.fetchOpenTasksCreatedByAssignment(
      snapshotId,
      filters
    );

    expect(taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows).toHaveBeenCalledWith(snapshotId, filters);
    expect(result).toEqual([
      { date: '2024-01-03', open: 0, assigned: 0, unassigned: 0, assignedPct: 0, unassignedPct: 100 },
    ]);
  });

  test('defaults missing totals to zero', async () => {
    const filters = {};
    (taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows as jest.Mock).mockResolvedValue([
      { date_key: '2024-01-04', assignment_state: 'Assigned', total: null },
    ]);

    const result = await openTasksCreatedByAssignmentChartService.fetchOpenTasksCreatedByAssignment(
      snapshotId,
      filters
    );

    expect(taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows).toHaveBeenCalledWith(snapshotId, filters);
    expect(result).toEqual([
      { date: '2024-01-04', open: 0, assigned: 0, unassigned: 0, assignedPct: 0, unassignedPct: 100 },
    ]);
  });

  test('propagates repository errors', async () => {
    const filters = { region: ['North'] };
    const error = new Error('db error');
    (taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows as jest.Mock).mockRejectedValue(error);

    await expect(
      openTasksCreatedByAssignmentChartService.fetchOpenTasksCreatedByAssignment(snapshotId, filters)
    ).rejects.toBe(error);
    expect(taskFactsRepository.fetchOpenTasksCreatedByAssignmentRows).toHaveBeenCalledWith(snapshotId, filters);
  });
});
