import {
  createSnapshotToken,
  fetchFacetedFilterStateWithFallback,
  fetchFilterOptionsWithFallback,
  fetchPublishedSnapshotContext,
  normaliseDateRange,
  parseSnapshotTokenInput,
  resolveDateRangeWithDefaults,
  settledArrayWithFallback,
  settledValueWithFallback,
} from '../../../../main/modules/analytics/shared/pageUtils';
import { filterService } from '../../../../main/modules/analytics/shared/services';
import { logDbError } from '../../../../main/modules/analytics/shared/utils';

const mockPublishedSnapshotCacheStore = new Map<string, unknown>();
function mockGetPublishedSnapshotCache(key: string): unknown {
  return mockPublishedSnapshotCacheStore.get(key);
}

function mockSetPublishedSnapshotCache(key: string, value: unknown): void {
  mockPublishedSnapshotCacheStore.set(key, value);
}
const currentPublishedSnapshotCacheKey = 'current-published-snapshot';

function cacheCurrentPublishedSnapshot(snapshot: { snapshotId: number; publishedAt?: Date }): void {
  mockPublishedSnapshotCacheStore.set(currentPublishedSnapshotCacheKey, snapshot);
}

jest.mock('../../../../main/modules/analytics/shared/cache/publishedSnapshotCache', () => ({
  CacheKeys: {
    currentPublishedSnapshot: 'current-published-snapshot',
  },
  getCache: mockGetPublishedSnapshotCache,
  setCache: mockSetPublishedSnapshotCache,
}));

jest.mock('../../../../main/modules/analytics/shared/services', () => ({
  filterService: { fetchFilterOptions: jest.fn(), fetchFacetedFilterState: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/shared/repositories', () => ({
  snapshotStateRepository: { fetchPublishedSnapshot: jest.fn(), fetchSnapshotById: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/shared/utils', () => ({
  logDbError: jest.fn(),
  settledValue: jest.requireActual('../../../../main/modules/analytics/shared/utils').settledValue,
}));

describe('pageUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublishedSnapshotCacheStore.clear();
  });

  afterEach(() => {
    mockPublishedSnapshotCacheStore.clear();
    jest.useRealTimers();
  });

  test('fetchFilterOptionsWithFallback returns data when service succeeds', async () => {
    (filterService.fetchFilterOptions as jest.Mock).mockResolvedValue({
      services: ['A'],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      users: [],
    });

    const result = await fetchFilterOptionsWithFallback('Failed', 7);

    expect(result.services).toEqual(['A']);
    expect(filterService.fetchFilterOptions).toHaveBeenCalledWith(7, undefined, 'overview');
    expect(logDbError).not.toHaveBeenCalled();
  });

  test('fetchFilterOptionsWithFallback logs errors and returns defaults', async () => {
    (filterService.fetchFilterOptions as jest.Mock).mockRejectedValue(new Error('db'));

    const result = await fetchFilterOptionsWithFallback('Failed', 7);

    expect(result).toEqual({
      services: [],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      users: [],
    });
    expect(logDbError).toHaveBeenCalledWith('Failed', expect.any(Error));
  });

  test('fetchFilterOptionsWithFallback passes query options through to filter service', async () => {
    (filterService.fetchFilterOptions as jest.Mock).mockResolvedValue({
      services: [],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      users: [],
    });

    await fetchFilterOptionsWithFallback('Failed', 7, { excludeRoleCategories: ['Judicial'] });

    expect(filterService.fetchFilterOptions).toHaveBeenCalledWith(
      7,
      { excludeRoleCategories: ['Judicial'] },
      'overview'
    );
  });

  test('fetchFilterOptionsWithFallback passes explicit scope and query options through to filter service', async () => {
    (filterService.fetchFilterOptions as jest.Mock).mockResolvedValue({
      services: [],
      roleCategories: [],
      regions: [],
      locations: [],
      taskNames: [],
      workTypes: [],
      users: [],
    });

    await fetchFilterOptionsWithFallback('Failed', 7, 'completed', { excludeRoleCategories: ['Legal Ops'] });

    expect(filterService.fetchFilterOptions).toHaveBeenCalledWith(
      7,
      { excludeRoleCategories: ['Legal Ops'] },
      'completed'
    );
  });

  test('fetchPublishedSnapshotContext maps snapshot metadata and freshness text', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    (snapshotStateRepository.fetchSnapshotById as jest.Mock).mockResolvedValue(null);
    (snapshotStateRepository.fetchPublishedSnapshot as jest.Mock).mockResolvedValue({
      snapshotId: 11,
      publishedAt: new Date('2026-02-17T10:15:00Z'),
    });

    const result = await fetchPublishedSnapshotContext();

    expect(result.snapshotId).toBe(11);
    expect(result.snapshotToken).toBe(createSnapshotToken(11));
    expect(result.publishedAt).toEqual(new Date('2026-02-17T10:15:00Z'));
    expect(result.freshnessInsetText).toContain('Data last refreshed:');
  });

  test('fetchPublishedSnapshotContext caches the current published snapshot for requests without a token', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    (snapshotStateRepository.fetchPublishedSnapshot as jest.Mock).mockResolvedValue({
      snapshotId: 13,
      publishedAt: new Date('2026-02-17T10:20:00Z'),
    });

    await expect(fetchPublishedSnapshotContext()).resolves.toEqual({
      snapshotId: 13,
      snapshotToken: createSnapshotToken(13),
      publishedAt: new Date('2026-02-17T10:20:00Z'),
      freshnessInsetText: expect.stringContaining('Data last refreshed:'),
    });

    jest.clearAllMocks();

    await expect(fetchPublishedSnapshotContext()).resolves.toEqual({
      snapshotId: 13,
      snapshotToken: createSnapshotToken(13),
      publishedAt: new Date('2026-02-17T10:20:00Z'),
      freshnessInsetText: expect.stringContaining('Data last refreshed:'),
    });
    expect(snapshotStateRepository.fetchPublishedSnapshot).not.toHaveBeenCalled();
    expect(snapshotStateRepository.fetchSnapshotById).not.toHaveBeenCalled();
  });

  test('fetchPublishedSnapshotContext returns empty context when no snapshot is published', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    (snapshotStateRepository.fetchSnapshotById as jest.Mock).mockResolvedValue(null);
    (snapshotStateRepository.fetchPublishedSnapshot as jest.Mock).mockResolvedValue(null);

    const result = await fetchPublishedSnapshotContext();

    expect(result.snapshotId).toBe(0);
    expect(result.snapshotToken).toBe('');
    expect(result.publishedAt).toBeUndefined();
    expect(result.freshnessInsetText).toBe('');
  });

  test('fetchPublishedSnapshotContext uses requested snapshot when available', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    (snapshotStateRepository.fetchSnapshotById as jest.Mock).mockResolvedValue({
      snapshotId: 15,
      publishedAt: new Date('2026-02-17T10:30:00Z'),
    });

    const result = await fetchPublishedSnapshotContext(15);

    expect(snapshotStateRepository.fetchSnapshotById).toHaveBeenCalledWith(15);
    expect(snapshotStateRepository.fetchPublishedSnapshot).not.toHaveBeenCalled();
    expect(result.snapshotId).toBe(15);
    expect(result.snapshotToken).toBe(createSnapshotToken(15));
    expect(result.publishedAt).toEqual(new Date('2026-02-17T10:30:00Z'));
  });

  test('fetchPublishedSnapshotContext skips fetchSnapshotById when the requested id matches the cached current snapshot', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    const cachedSnapshot = {
      snapshotId: 17,
      publishedAt: new Date('2026-02-17T10:40:00Z'),
    };
    cacheCurrentPublishedSnapshot(cachedSnapshot);

    const result = await fetchPublishedSnapshotContext(17);

    expect(snapshotStateRepository.fetchSnapshotById).not.toHaveBeenCalled();
    expect(snapshotStateRepository.fetchPublishedSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({
      snapshotId: 17,
      snapshotToken: createSnapshotToken(17),
      publishedAt: new Date('2026-02-17T10:40:00Z'),
      freshnessInsetText: expect.stringContaining('Data last refreshed:'),
    });
  });

  test('fetchPublishedSnapshotContext warms the current snapshot cache from fetchSnapshotById when the requested snapshot is current', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    const currentSnapshot = {
      snapshotId: 18,
      publishedAt: new Date('2026-02-17T10:50:00Z'),
    };
    (snapshotStateRepository.fetchSnapshotById as jest.Mock).mockResolvedValue(currentSnapshot);

    await expect(fetchPublishedSnapshotContext(18)).resolves.toEqual({
      snapshotId: 18,
      snapshotToken: createSnapshotToken(18),
      publishedAt: new Date('2026-02-17T10:50:00Z'),
      freshnessInsetText: expect.stringContaining('Data last refreshed:'),
    });

    jest.clearAllMocks();

    await expect(fetchPublishedSnapshotContext(18)).resolves.toEqual({
      snapshotId: 18,
      snapshotToken: createSnapshotToken(18),
      publishedAt: new Date('2026-02-17T10:50:00Z'),
      freshnessInsetText: expect.stringContaining('Data last refreshed:'),
    });
    expect(snapshotStateRepository.fetchSnapshotById).not.toHaveBeenCalled();
    expect(snapshotStateRepository.fetchPublishedSnapshot).not.toHaveBeenCalled();
  });

  test('fetchPublishedSnapshotContext falls back to current published snapshot when requested id is unavailable', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    (snapshotStateRepository.fetchSnapshotById as jest.Mock).mockResolvedValue(null);
    (snapshotStateRepository.fetchPublishedSnapshot as jest.Mock).mockResolvedValue({
      snapshotId: 16,
      publishedAt: new Date('2026-02-17T10:45:00Z'),
    });

    const result = await fetchPublishedSnapshotContext(999);

    expect(snapshotStateRepository.fetchSnapshotById).toHaveBeenCalledWith(999);
    expect(snapshotStateRepository.fetchPublishedSnapshot).toHaveBeenCalled();
    expect(result.snapshotId).toBe(16);
    expect(result.snapshotToken).toBe(createSnapshotToken(16));
    expect(result.publishedAt).toEqual(new Date('2026-02-17T10:45:00Z'));
  });

  test('fetchPublishedSnapshotContext does not overwrite the cached current snapshot when an older snapshot is requested', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    cacheCurrentPublishedSnapshot({
      snapshotId: 19,
      publishedAt: new Date('2026-02-17T11:00:00Z'),
    });
    (snapshotStateRepository.fetchSnapshotById as jest.Mock).mockResolvedValue({
      snapshotId: 14,
      publishedAt: undefined,
    });

    await expect(fetchPublishedSnapshotContext(14)).resolves.toEqual({
      snapshotId: 14,
      snapshotToken: createSnapshotToken(14),
      publishedAt: undefined,
      freshnessInsetText: 'Data freshness unavailable.',
    });

    jest.clearAllMocks();

    await expect(fetchPublishedSnapshotContext(19)).resolves.toEqual({
      snapshotId: 19,
      snapshotToken: createSnapshotToken(19),
      publishedAt: new Date('2026-02-17T11:00:00Z'),
      freshnessInsetText: expect.stringContaining('Data last refreshed:'),
    });
    expect(snapshotStateRepository.fetchSnapshotById).not.toHaveBeenCalled();
    expect(snapshotStateRepository.fetchPublishedSnapshot).not.toHaveBeenCalled();
  });

  test('fetchPublishedSnapshotContext does not cache the unpublished state', async () => {
    const { snapshotStateRepository } = jest.requireMock('../../../../main/modules/analytics/shared/repositories');
    (snapshotStateRepository.fetchPublishedSnapshot as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({
      snapshotId: 20,
      publishedAt: new Date('2026-02-17T11:15:00Z'),
    });

    await expect(fetchPublishedSnapshotContext()).resolves.toEqual({
      snapshotId: 0,
      snapshotToken: '',
      publishedAt: undefined,
      freshnessInsetText: '',
    });

    await expect(fetchPublishedSnapshotContext()).resolves.toEqual({
      snapshotId: 20,
      snapshotToken: createSnapshotToken(20),
      publishedAt: new Date('2026-02-17T11:15:00Z'),
      freshnessInsetText: expect.stringContaining('Data last refreshed:'),
    });
    expect(snapshotStateRepository.fetchPublishedSnapshot).toHaveBeenCalledTimes(2);
  });

  test('parseSnapshotTokenInput parses valid signed tokens', () => {
    const token = createSnapshotToken(12);
    expect(parseSnapshotTokenInput(token)).toBe(12);
    expect(parseSnapshotTokenInput([token])).toBe(12);
    expect(parseSnapshotTokenInput(` ${token} `)).toBe(12);
  });

  test('parseSnapshotTokenInput rejects invalid or tampered tokens', () => {
    const validToken = createSnapshotToken(34);
    const tamperedToken = `${validToken.split('.')[0]}.tampered-signature`;

    expect(parseSnapshotTokenInput('')).toBeUndefined();
    expect(parseSnapshotTokenInput('abc')).toBeUndefined();
    expect(parseSnapshotTokenInput('12')).toBeUndefined();
    expect(parseSnapshotTokenInput(`${validToken}.extra`)).toBeUndefined();
    expect(parseSnapshotTokenInput(tamperedToken)).toBeUndefined();
    expect(parseSnapshotTokenInput(undefined)).toBeUndefined();
  });

  test('parseSnapshotTokenInput rejects invalid snapshot id parts', () => {
    expect(parseSnapshotTokenInput('abc.signature')).toBeUndefined();
    const validSignatureForTwelve = createSnapshotToken(12).split('.')[1];
    expect(parseSnapshotTokenInput(`12abc12.${validSignatureForTwelve}`)).toBeUndefined();
    expect(parseSnapshotTokenInput(createSnapshotToken(0))).toBeUndefined();
    expect(parseSnapshotTokenInput('9007199254740993.signature')).toBeUndefined();
  });

  test('normaliseDateRange swaps dates when needed', () => {
    const range = normaliseDateRange({ from: new Date('2024-05-10'), to: new Date('2024-05-01') });

    expect(range).toEqual({ from: new Date('2024-05-01'), to: new Date('2024-05-10') });
  });

  test('normaliseDateRange returns undefined when empty', () => {
    expect(normaliseDateRange()).toBeUndefined();
  });

  test('normaliseDateRange keeps single-sided ranges', () => {
    const from = new Date('2024-05-01T00:00:00.000Z');

    expect(normaliseDateRange({ from })).toEqual({ from, to: undefined });
  });

  test('normaliseDateRange does not swap equal ranges', () => {
    const from = new Date('2024-05-01T00:00:00.000Z');
    const to = new Date('2024-05-01T00:00:00.000Z');

    const range = normaliseDateRange({ from, to });

    expect(range?.from).toBe(from);
    expect(range?.to).toBe(to);
  });

  test('resolveDateRangeWithDefaults returns a 30-day window by default', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00.000Z'));

    const { from, to } = resolveDateRangeWithDefaults({});

    expect(from).toEqual(new Date(2025, 11, 16));
    expect(to).toEqual(new Date(2026, 0, 15));
  });

  test('resolveDateRangeWithDefaults uses custom daysBack values', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00.000Z'));

    const { from, to } = resolveDateRangeWithDefaults({ daysBack: 7 });

    expect(from).toEqual(new Date(2026, 0, 8));
    expect(to).toEqual(new Date(2026, 0, 15));
  });

  test('resolveDateRangeWithDefaults swaps inverted ranges', () => {
    const { from, to } = resolveDateRangeWithDefaults({
      from: new Date('2024-05-10'),
      to: new Date('2024-05-01'),
    });

    expect(from).toEqual(new Date('2024-05-01'));
    expect(to).toEqual(new Date('2024-05-10'));
  });

  test('resolveDateRangeWithDefaults keeps equal provided dates in place', () => {
    const from = new Date('2024-05-01T00:00:00.000Z');
    const to = new Date('2024-05-01T00:00:00.000Z');

    const range = resolveDateRangeWithDefaults({ from, to });

    expect(range.from).toBe(from);
    expect(range.to).toBe(to);
  });

  test('settledValueWithFallback uses fallback when rejected', () => {
    const result = settledValueWithFallback({ status: 'rejected', reason: 'boom' }, 'Failed', 42);

    expect(result).toBe(42);
    expect(logDbError).toHaveBeenCalledWith('Failed', 'boom');
  });

  test('settledValueWithFallback returns value when present', () => {
    const result = settledValueWithFallback({ status: 'fulfilled', value: 7 }, 'Failed', 42);

    expect(result).toBe(7);
  });

  test('settledArrayWithFallback uses fallback for empty arrays', () => {
    const result = settledArrayWithFallback({ status: 'fulfilled', value: [] }, 'Failed', [1, 2]);

    expect(result).toEqual([1, 2]);
  });

  test('settledArrayWithFallback returns non-empty arrays', () => {
    const result = settledArrayWithFallback({ status: 'fulfilled', value: [3] }, 'Failed', [1, 2]);

    expect(result).toEqual([3]);
  });

  test('fetchFacetedFilterStateWithFallback returns resolved state on success', async () => {
    (filterService.fetchFacetedFilterState as jest.Mock).mockResolvedValue({
      filters: { service: ['Civil'] },
      filterOptions: {
        services: ['Civil'],
        roleCategories: ['Ops'],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
    });

    const result = await fetchFacetedFilterStateWithFallback({
      errorMessage: 'Faceted failed',
      snapshotId: 12,
      filters: { service: ['Civil'] },
      changedFilter: 'service',
      includeUserFilter: false,
    });

    expect(filterService.fetchFacetedFilterState).toHaveBeenCalledWith(
      12,
      { service: ['Civil'] },
      {
        scope: 'overview',
        queryOptions: undefined,
        changedFilter: 'service',
        includeUserFilter: false,
      }
    );
    expect(result.filters).toEqual({ service: ['Civil'] });
    expect(result.filterOptions.services).toEqual(['Civil']);
    expect(result.hadError).toBe(false);
  });

  test('fetchFacetedFilterStateWithFallback returns safe defaults on error', async () => {
    (filterService.fetchFacetedFilterState as jest.Mock).mockRejectedValue(new Error('db'));

    const result = await fetchFacetedFilterStateWithFallback({
      errorMessage: 'Faceted failed',
      snapshotId: 12,
      filters: { region: ['North'] },
    });

    expect(result).toEqual({
      filters: { region: ['North'] },
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      hadError: true,
    });
    expect(logDbError).toHaveBeenCalledWith('Faceted failed', expect.any(Error));
  });
});
