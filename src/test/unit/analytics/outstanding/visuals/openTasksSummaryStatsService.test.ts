import { openTasksSummaryStatsService } from '../../../../../main/modules/analytics/outstanding/visuals/openTasksSummaryStatsService';
import { taskFactsRepository } from '../../../../../main/modules/analytics/shared/repositories';

jest.mock('../../../../../main/modules/analytics/shared/repositories', () => ({
  taskFactsRepository: { fetchOpenTasksSummaryRows: jest.fn() },
}));

describe('openTasksSummaryStatsService', () => {
  const snapshotId = 310;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns null when no summary rows are available', async () => {
    const filters = {};
    (taskFactsRepository.fetchOpenTasksSummaryRows as jest.Mock).mockResolvedValue([]);

    const result = await openTasksSummaryStatsService.fetchOpenTasksSummary(snapshotId, filters);

    expect(taskFactsRepository.fetchOpenTasksSummaryRows).toHaveBeenCalledWith(snapshotId, filters);
    expect(result).toBeNull();
  });

  test('maps summary totals and calculates percentages', async () => {
    (taskFactsRepository.fetchOpenTasksSummaryRows as jest.Mock).mockResolvedValue([
      { assigned: '3', unassigned: 1, urgent: 2, high: 1, medium: null, low: undefined },
    ]);

    const result = await openTasksSummaryStatsService.fetchOpenTasksSummary(snapshotId, { region: ['North'] });

    expect(taskFactsRepository.fetchOpenTasksSummaryRows).toHaveBeenCalledWith(snapshotId, {
      region: ['North'],
    });
    expect(result).toEqual({
      open: 4,
      assigned: 3,
      unassigned: 1,
      assignedPct: 75,
      unassignedPct: 25,
      urgent: 2,
      high: 1,
      medium: 0,
      low: 0,
    });
  });

  test('defaults percentages when open totals are zero', async () => {
    const filters = {};
    (taskFactsRepository.fetchOpenTasksSummaryRows as jest.Mock).mockResolvedValue([
      { assigned: 0, unassigned: 0, urgent: 0, high: 0, medium: 0, low: 0 },
    ]);

    const result = await openTasksSummaryStatsService.fetchOpenTasksSummary(snapshotId, filters);

    expect(taskFactsRepository.fetchOpenTasksSummaryRows).toHaveBeenCalledWith(snapshotId, filters);
    expect(result).toEqual({
      open: 0,
      assigned: 0,
      unassigned: 0,
      assignedPct: 0,
      unassignedPct: 100,
      urgent: 0,
      high: 0,
      medium: 0,
      low: 0,
    });
  });

  test('propagates repository errors', async () => {
    const filters = { region: ['North'] };
    const error = new Error('db error');
    (taskFactsRepository.fetchOpenTasksSummaryRows as jest.Mock).mockRejectedValue(error);

    await expect(openTasksSummaryStatsService.fetchOpenTasksSummary(snapshotId, filters)).rejects.toBe(error);
    expect(taskFactsRepository.fetchOpenTasksSummaryRows).toHaveBeenCalledWith(snapshotId, filters);
  });
});
