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
  });

  afterEach(() => {
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
    expect(filterService.fetchFilterOptions).toHaveBeenCalledWith(7, undefined);
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

    expect(filterService.fetchFilterOptions).toHaveBeenCalledWith(7, { excludeRoleCategories: ['Judicial'] });
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

  test('parseSnapshotTokenInput parses valid signed tokens', () => {
    const token = createSnapshotToken(12);
    expect(parseSnapshotTokenInput(token)).toBe(12);
    expect(parseSnapshotTokenInput([token])).toBe(12);
  });

  test('parseSnapshotTokenInput rejects invalid or tampered tokens', () => {
    const validToken = createSnapshotToken(34);
    const tamperedToken = `${validToken.split('.')[0]}.tampered-signature`;

    expect(parseSnapshotTokenInput('')).toBeUndefined();
    expect(parseSnapshotTokenInput('abc')).toBeUndefined();
    expect(parseSnapshotTokenInput('12')).toBeUndefined();
    expect(parseSnapshotTokenInput('12.abc.extra')).toBeUndefined();
    expect(parseSnapshotTokenInput(tamperedToken)).toBeUndefined();
    expect(parseSnapshotTokenInput(undefined)).toBeUndefined();
  });

  test('parseSnapshotTokenInput rejects invalid snapshot id parts', () => {
    expect(parseSnapshotTokenInput('abc.signature')).toBeUndefined();
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
        queryOptions: undefined,
        changedFilter: 'service',
        includeUserFilter: false,
      }
    );
    expect(result.filters).toEqual({ service: ['Civil'] });
    expect(result.filterOptions.services).toEqual(['Civil']);
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
    });
    expect(logDbError).toHaveBeenCalledWith('Faceted failed', expect.any(Error));
  });
});
