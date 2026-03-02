import { tasksDueByPriorityChartService } from '../../../../../main/modules/analytics/outstanding/visuals/tasksDueByPriorityChartService';
import { taskFactsRepository } from '../../../../../main/modules/analytics/shared/repositories';

jest.mock('../../../../../main/modules/analytics/shared/repositories', () => ({
  taskFactsRepository: { fetchTasksDuePriorityRows: jest.fn() },
}));

describe('tasksDueByPriorityChartService', () => {
  const snapshotId = 308;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('maps rows into due-by-priority points with numeric fallbacks', async () => {
    (taskFactsRepository.fetchTasksDuePriorityRows as jest.Mock).mockResolvedValue([
      { date_key: '2024-02-01', urgent: 2, high: '3', medium: null, low: undefined },
      { date_key: '2024-02-02', urgent: undefined, high: undefined, medium: undefined, low: undefined },
    ]);

    const result = await tasksDueByPriorityChartService.fetchTasksDueByPriority(snapshotId, { region: ['North'] });

    expect(taskFactsRepository.fetchTasksDuePriorityRows).toHaveBeenCalledWith(snapshotId, { region: ['North'] });
    expect(result).toEqual([
      { date: '2024-02-01', urgent: 2, high: 3, medium: 0, low: 0 },
      { date: '2024-02-02', urgent: 0, high: 0, medium: 0, low: 0 },
    ]);
  });

  test('propagates repository errors', async () => {
    const filters = { region: ['North'] };
    const error = new Error('db error');
    (taskFactsRepository.fetchTasksDuePriorityRows as jest.Mock).mockRejectedValue(error);

    await expect(tasksDueByPriorityChartService.fetchTasksDueByPriority(snapshotId, filters)).rejects.toBe(error);
    expect(taskFactsRepository.fetchTasksDuePriorityRows).toHaveBeenCalledWith(snapshotId, filters);
  });
});
