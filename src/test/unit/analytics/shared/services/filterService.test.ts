import {
  CacheKeys,
  buildSnapshotScopedCacheKey,
  getCache,
  setCache,
} from '../../../../../main/modules/analytics/shared/cache/cache';
import { taskFactsRepository } from '../../../../../main/modules/analytics/shared/repositories';
import {
  caseWorkerProfileService,
  courtVenueService,
  regionService,
} from '../../../../../main/modules/analytics/shared/services';
import { filterService } from '../../../../../main/modules/analytics/shared/services/filterService';

jest.mock('../../../../../main/modules/analytics/shared/cache/cache', () => ({
  CacheKeys: { filterOptions: 'filter-options' },
  buildSnapshotScopedCacheKey: jest.fn(
    (base: string, snapshotId: number, scope = 'default') => `${base}:${snapshotId}:${scope}`
  ),
  getCache: jest.fn(),
  setCache: jest.fn(),
}));

jest.mock('../../../../../main/modules/analytics/shared/repositories', () => ({
  taskFactsRepository: { fetchOverviewFilterOptionsRows: jest.fn() },
}));

jest.mock('../../../../../main/modules/analytics/shared/services/index', () => ({
  caseWorkerProfileService: { fetchCaseWorkerProfiles: jest.fn() },
  courtVenueService: { fetchCourtVenues: jest.fn() },
  regionService: { fetchRegions: jest.fn() },
}));

describe('filterService', () => {
  const snapshotId = 42;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns cached options when available', async () => {
    (getCache as jest.Mock).mockReturnValue({
      services: ['cached'],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      users: [],
    });

    const result = await filterService.fetchFilterOptions(snapshotId);

    expect(result.services).toEqual(['cached']);
    expect(buildSnapshotScopedCacheKey).toHaveBeenCalledWith(
      CacheKeys.filterOptions,
      snapshotId,
      'includeUser=1|filters=none|query=default'
    );
    expect(taskFactsRepository.fetchOverviewFilterOptionsRows).not.toHaveBeenCalled();
  });

  test('builds filter options and stores them in cache', async () => {
    (getCache as jest.Mock).mockReturnValue(undefined);
    (taskFactsRepository.fetchOverviewFilterOptionsRows as jest.Mock).mockResolvedValue({
      services: [{ value: 'Service A' }],
      roleCategories: [{ value: 'Ops' }],
      regions: [{ value: '1' }, { value: '' }, { value: '99' }],
      locations: [{ value: '100' }, { value: '' }, { value: '999' }],
      taskNames: [{ value: 'Review' }],
      workTypes: [{ value: 'hearing-work-type', text: 'Hearing work' }],
      assignees: [{ value: 'user-1' }, { value: 'user-2' }],
    });
    (regionService.fetchRegions as jest.Mock).mockResolvedValue([{ region_id: '1', description: 'North' }]);
    (courtVenueService.fetchCourtVenues as jest.Mock).mockResolvedValue([{ epimms_id: '100', site_name: 'Leeds' }]);
    (caseWorkerProfileService.fetchCaseWorkerProfiles as jest.Mock).mockResolvedValue([
      { case_worker_id: 'user-1', first_name: 'Sam', last_name: 'Lee', email_id: 'sam@example.com', region_id: 1 },
      { case_worker_id: 'user-3', first_name: 'Alex', last_name: 'P', email_id: 'alex@example.com', region_id: 2 },
    ]);

    const result = await filterService.fetchFilterOptions(snapshotId);

    expect(result.services).toEqual(['Service A']);
    expect(result.roleCategories).toEqual(['Ops']);
    expect(result.taskNames).toEqual(['Review']);
    expect(result.workTypes).toEqual([{ value: 'hearing-work-type', text: 'Hearing work' }]);
    expect(result.regions).toEqual([
      { value: '', text: 'All regions' },
      { value: '', text: '(Blank)' },
      { value: '99', text: '99' },
      { value: '1', text: 'North' },
    ]);
    expect(result.locations).toEqual([
      { value: '', text: 'All locations' },
      { value: '', text: '(Blank)' },
      { value: '999', text: '999' },
      { value: '100', text: 'Leeds' },
    ]);
    expect(result.users[0]).toEqual({ value: '', text: 'All users' });
    expect(result.users[1].value).toBe('user-1');
    expect(result.users.find(option => option.value === 'user-2')).toBeUndefined();
    expect(taskFactsRepository.fetchOverviewFilterOptionsRows).toHaveBeenCalledWith(snapshotId, {
      filters: {},
      queryOptions: undefined,
      includeUserFilter: true,
    });
    expect(setCache).toHaveBeenCalledWith(
      `${CacheKeys.filterOptions}:${snapshotId}:includeUser=1|filters=none|query=default`,
      result
    );
  });

  test('uses options-aware cache key signatures and passes query options to the repository', async () => {
    (getCache as jest.Mock).mockReturnValue(undefined);
    (taskFactsRepository.fetchOverviewFilterOptionsRows as jest.Mock).mockResolvedValue({
      services: [],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      assignees: [],
    });
    (regionService.fetchRegions as jest.Mock).mockResolvedValue([]);
    (courtVenueService.fetchCourtVenues as jest.Mock).mockResolvedValue([]);
    (caseWorkerProfileService.fetchCaseWorkerProfiles as jest.Mock).mockResolvedValue([]);

    await filterService.fetchFilterOptions(snapshotId, {
      excludeRoleCategories: ['Judicial'],
    });

    expect(buildSnapshotScopedCacheKey).toHaveBeenCalledWith(
      CacheKeys.filterOptions,
      snapshotId,
      'includeUser=1|filters=none|query=excludeRoleCategories=JUDICIAL'
    );
    expect(taskFactsRepository.fetchOverviewFilterOptionsRows).toHaveBeenCalledWith(snapshotId, {
      filters: {},
      queryOptions: { excludeRoleCategories: ['Judicial'] },
      includeUserFilter: true,
    });
  });

  test('normalises excludeRoleCategories signature and falls back to default when values are blank', async () => {
    (getCache as jest.Mock).mockReturnValue(undefined);
    (taskFactsRepository.fetchOverviewFilterOptionsRows as jest.Mock).mockResolvedValue({
      services: [],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      assignees: [],
    });
    (regionService.fetchRegions as jest.Mock).mockResolvedValue([]);
    (courtVenueService.fetchCourtVenues as jest.Mock).mockResolvedValue([]);
    (caseWorkerProfileService.fetchCaseWorkerProfiles as jest.Mock).mockResolvedValue([]);

    await filterService.fetchFilterOptions(snapshotId, {
      excludeRoleCategories: ['  ', '', ' judicial ', 'ADMIN', 'admin'],
    });

    expect(buildSnapshotScopedCacheKey).toHaveBeenCalledWith(
      CacheKeys.filterOptions,
      snapshotId,
      'includeUser=1|filters=none|query=excludeRoleCategories=ADMIN,JUDICIAL'
    );

    await filterService.fetchFilterOptions(snapshotId, {
      excludeRoleCategories: ['  ', ''],
    });
    expect(buildSnapshotScopedCacheKey).toHaveBeenLastCalledWith(
      CacheKeys.filterOptions,
      snapshotId,
      'includeUser=1|filters=none|query=default'
    );
  });

  test('prunes conflicting non-changed selections and refetches options for canonical filters', async () => {
    (getCache as jest.Mock).mockReturnValue(undefined);
    (taskFactsRepository.fetchOverviewFilterOptionsRows as jest.Mock)
      .mockResolvedValueOnce({
        services: [{ value: 'Civil' }],
        roleCategories: [{ value: 'Ops' }],
        regions: [{ value: 'North' }],
        locations: [{ value: '100' }],
        taskNames: [{ value: 'Review' }],
        workTypes: [{ value: 'hearing-work-type', text: 'Hearing work' }],
        assignees: [],
      })
      .mockResolvedValueOnce({
        services: [{ value: 'Civil' }],
        roleCategories: [{ value: 'Ops' }],
        regions: [{ value: 'North' }],
        locations: [{ value: '100' }],
        taskNames: [{ value: 'Review' }],
        workTypes: [{ value: 'hearing-work-type', text: 'Hearing work' }],
        assignees: [],
      });
    (regionService.fetchRegions as jest.Mock).mockResolvedValue([{ region_id: '1', description: 'North' }]);
    (courtVenueService.fetchCourtVenues as jest.Mock).mockResolvedValue([{ epimms_id: '100', site_name: 'Leeds' }]);

    const result = await filterService.fetchFacetedFilterState(
      snapshotId,
      {
        service: ['Civil'],
        region: ['South'],
      },
      {
        changedFilter: 'service',
        includeUserFilter: false,
      }
    );

    expect(taskFactsRepository.fetchOverviewFilterOptionsRows).toHaveBeenNthCalledWith(1, snapshotId, {
      filters: { service: ['Civil'], region: ['South'] },
      queryOptions: undefined,
      includeUserFilter: false,
    });
    expect(taskFactsRepository.fetchOverviewFilterOptionsRows).toHaveBeenNthCalledWith(2, snapshotId, {
      filters: { service: ['Civil'] },
      queryOptions: undefined,
      includeUserFilter: false,
    });
    expect(result.filters).toEqual({ service: ['Civil'] });
    expect(result.filterOptions.services).toEqual(['Civil']);
    expect(caseWorkerProfileService.fetchCaseWorkerProfiles).not.toHaveBeenCalled();
  });

  test('retains compatible values for non-changed filters and keeps original filters when changed filter is missing', async () => {
    (getCache as jest.Mock).mockReturnValue(undefined);
    (taskFactsRepository.fetchOverviewFilterOptionsRows as jest.Mock).mockResolvedValue({
      services: [{ value: 'Civil' }],
      roleCategories: [{ value: 'Ops' }],
      regions: [{ value: 'North' }],
      locations: [{ value: '100' }],
      taskNames: [{ value: 'Review' }],
      workTypes: [{ value: 'hearing-work-type', text: 'Hearing work' }],
      assignees: [{ value: '111' }],
    });
    (regionService.fetchRegions as jest.Mock).mockResolvedValue([]);
    (courtVenueService.fetchCourtVenues as jest.Mock).mockResolvedValue([]);
    (caseWorkerProfileService.fetchCaseWorkerProfiles as jest.Mock).mockResolvedValue([
      { case_worker_id: '111', first_name: 'Sam', last_name: 'Lee', email_id: 'sam@example.com', region_id: 1 },
    ]);

    const retained = await filterService.fetchFacetedFilterState(
      snapshotId,
      {
        service: [' Civil '],
        roleCategory: ['Ops', 'Legacy'],
        user: ['111'],
      },
      {
        changedFilter: 'service',
        includeUserFilter: true,
      }
    );
    expect(retained.filters).toEqual({
      service: ['Civil'],
      roleCategory: ['Ops'],
      user: ['111'],
    });
    expect(taskFactsRepository.fetchOverviewFilterOptionsRows).toHaveBeenCalledTimes(2);

    (taskFactsRepository.fetchOverviewFilterOptionsRows as jest.Mock).mockClear();
    (buildSnapshotScopedCacheKey as jest.Mock).mockClear();

    const unchanged = await filterService.fetchFacetedFilterState(
      snapshotId,
      {
        service: [' Civil '],
        roleCategory: [' Ops '],
      },
      {
        includeUserFilter: false,
      }
    );
    expect(unchanged.filters).toEqual({
      service: ['Civil'],
      roleCategory: ['Ops'],
    });
    expect(taskFactsRepository.fetchOverviewFilterOptionsRows).toHaveBeenCalledTimes(1);
    expect(buildSnapshotScopedCacheKey).toHaveBeenCalledWith(
      CacheKeys.filterOptions,
      snapshotId,
      'includeUser=0|filters=service=Civil;roleCategory=Ops|query=default'
    );
  });
});
