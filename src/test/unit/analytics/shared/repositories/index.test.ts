import * as repositories from '../../../../../main/modules/analytics/shared/repositories';
import { caseWorkerProfileRepository } from '../../../../../main/modules/analytics/shared/repositories/caseWorkerProfileRepository';
import { courtVenueRepository } from '../../../../../main/modules/analytics/shared/repositories/courtVenueRepository';
import { regionRepository } from '../../../../../main/modules/analytics/shared/repositories/regionRepository';
import { snapshotStateRepository } from '../../../../../main/modules/analytics/shared/repositories/snapshotStateRepository';
import { taskFactsRepository } from '../../../../../main/modules/analytics/shared/repositories/taskFactsRepository';
import { taskThinRepository } from '../../../../../main/modules/analytics/shared/repositories/taskThinRepository';

describe('repositories index', () => {
  test('re-exports repositories from source modules', () => {
    expect(repositories.caseWorkerProfileRepository).toBe(caseWorkerProfileRepository);
    expect(repositories.regionRepository).toBe(regionRepository);
    expect(repositories.courtVenueRepository).toBe(courtVenueRepository);
    expect(repositories.snapshotStateRepository).toBe(snapshotStateRepository);
    expect(repositories.taskFactsRepository).toBe(taskFactsRepository);
    expect(repositories.taskThinRepository).toBe(taskThinRepository);
  });
});
