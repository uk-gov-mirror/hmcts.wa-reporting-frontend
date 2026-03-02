import { openTasksByNameChartService } from '../../../../../main/modules/analytics/outstanding/visuals/openTasksByNameChartService';
import { taskFactsRepository } from '../../../../../main/modules/analytics/shared/repositories';

jest.mock('../../../../../main/modules/analytics/shared/repositories', () => ({
  taskFactsRepository: { fetchOpenTasksByNameRows: jest.fn() },
}));

describe('openTasksByNameChartService', () => {
  const snapshotId = 309;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('normalises labels, sorts by priority and produces totals', async () => {
    (taskFactsRepository.fetchOpenTasksByNameRows as jest.Mock).mockResolvedValue([
      { task_name: null, urgent: 1, high: null, medium: 0, low: undefined },
      { task_name: 'Beta', urgent: 0, high: 2, medium: 1, low: 0 },
      { task_name: 'Alpha', urgent: 1, high: 0, medium: 0, low: 0 },
    ]);

    const result = await openTasksByNameChartService.fetchOpenTasksByName(snapshotId, { service: ['Service A'] });

    expect(taskFactsRepository.fetchOpenTasksByNameRows).toHaveBeenCalledWith(snapshotId, {
      service: ['Service A'],
    });
    expect(result.breakdown).toEqual([
      { name: 'Alpha', urgent: 1, high: 0, medium: 0, low: 0 },
      { name: 'Unknown task', urgent: 1, high: 0, medium: 0, low: 0 },
      { name: 'Beta', urgent: 0, high: 2, medium: 1, low: 0 },
    ]);
    expect(result.totals).toEqual({
      name: 'Total',
      urgent: 2,
      high: 2,
      medium: 1,
      low: 0,
    });
  });

  test('propagates repository errors', async () => {
    const filters = { service: ['Service A'] };
    const error = new Error('db error');
    (taskFactsRepository.fetchOpenTasksByNameRows as jest.Mock).mockRejectedValue(error);

    await expect(openTasksByNameChartService.fetchOpenTasksByName(snapshotId, filters)).rejects.toBe(error);
    expect(taskFactsRepository.fetchOpenTasksByNameRows).toHaveBeenCalledWith(snapshotId, filters);
  });
});
