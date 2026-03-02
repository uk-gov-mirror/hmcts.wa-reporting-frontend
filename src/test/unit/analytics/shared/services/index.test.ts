import * as services from '../../../../../main/modules/analytics/shared/services';
import { caseWorkerProfileService } from '../../../../../main/modules/analytics/shared/services/caseWorkerProfileService';
import { courtVenueService } from '../../../../../main/modules/analytics/shared/services/courtVenueService';
import { filterService } from '../../../../../main/modules/analytics/shared/services/filterService';
import { regionService } from '../../../../../main/modules/analytics/shared/services/regionService';

describe('services index', () => {
  test('re-exports analytics services from source modules', () => {
    expect(services.caseWorkerProfileService).toBe(caseWorkerProfileService);
    expect(services.courtVenueService).toBe(courtVenueService);
    expect(services.filterService).toBe(filterService);
    expect(services.regionService).toBe(regionService);
  });
});
