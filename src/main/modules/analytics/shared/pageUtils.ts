import config from 'config';
import { createHmac, timingSafeEqual } from 'crypto';

import { emptyOverviewFilterOptions } from './filters';
import type { FacetFilterKey } from './filters';
import { buildFreshnessInsetText } from './formatting';
import type { AnalyticsQueryOptions } from './repositories/filters';
import { snapshotStateRepository } from './repositories';
import type { AnalyticsFilters } from './types';
import { type FilterOptions, filterService } from './services';
import { logDbError, settledValue } from './utils';

const snapshotTokenSecret: string = config.get('secrets.wa.wa-reporting-frontend-session-secret');

export type PublishedSnapshotContext = {
  snapshotId: number;
  snapshotToken: string;
  publishedAt?: Date;
  freshnessInsetText: string;
};

const UNPUBLISHED_SNAPSHOT_ID = 0;

function signSnapshotId(snapshotId: number): string {
  return createHmac('sha256', snapshotTokenSecret).update(String(snapshotId)).digest('base64url');
}

function isEqualSignature(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createSnapshotToken(snapshotId: number): string {
  return `${snapshotId}.${signSnapshotId(snapshotId)}`;
}

function toPublishedSnapshotContext(snapshot: { snapshotId: number; publishedAt?: Date }): PublishedSnapshotContext {
  return {
    snapshotId: snapshot.snapshotId,
    snapshotToken: createSnapshotToken(snapshot.snapshotId),
    publishedAt: snapshot.publishedAt,
    freshnessInsetText: buildFreshnessInsetText(snapshot.publishedAt),
  };
}

function toUnpublishedSnapshotContext(): PublishedSnapshotContext {
  return {
    snapshotId: UNPUBLISHED_SNAPSHOT_ID,
    snapshotToken: '',
    freshnessInsetText: '',
  };
}

export async function fetchPublishedSnapshotContext(requestedSnapshotId?: number): Promise<PublishedSnapshotContext> {
  if (requestedSnapshotId !== undefined) {
    const requested = await snapshotStateRepository.fetchSnapshotById(requestedSnapshotId);
    if (requested) {
      return toPublishedSnapshotContext(requested);
    }
  }

  const snapshot = await snapshotStateRepository.fetchPublishedSnapshot();
  if (!snapshot) {
    return toUnpublishedSnapshotContext();
  }
  return toPublishedSnapshotContext(snapshot);
}

function parseSnapshotIdInput(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function parseSnapshotTokenInput(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return parseSnapshotTokenInput(value[0]);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const [snapshotIdPart, signature, ...rest] = value.trim().split('.');
  if (!snapshotIdPart || !signature || rest.length > 0) {
    return undefined;
  }

  const snapshotId = parseSnapshotIdInput(snapshotIdPart);
  if (snapshotId === undefined) {
    return undefined;
  }

  const expectedSignature = signSnapshotId(snapshotId);
  if (!isEqualSignature(signature, expectedSignature)) {
    return undefined;
  }

  return snapshotId;
}

export async function fetchFilterOptionsWithFallback(
  errorMessage: string,
  snapshotId: number,
  queryOptions?: AnalyticsQueryOptions
): Promise<FilterOptions> {
  let filterOptions = emptyOverviewFilterOptions();
  try {
    filterOptions = await filterService.fetchFilterOptions(snapshotId, queryOptions);
  } catch (error) {
    logDbError(errorMessage, error);
  }
  return filterOptions;
}

export async function fetchFacetedFilterStateWithFallback(params: {
  errorMessage: string;
  snapshotId: number;
  filters: AnalyticsFilters;
  queryOptions?: AnalyticsQueryOptions;
  changedFilter?: FacetFilterKey;
  includeUserFilter?: boolean;
}): Promise<{ filters: AnalyticsFilters; filterOptions: FilterOptions }> {
  const { errorMessage, snapshotId, filters, queryOptions, changedFilter, includeUserFilter } = params;
  let resolvedFilters = filters;
  let filterOptions = emptyOverviewFilterOptions();

  try {
    const resolved = await filterService.fetchFacetedFilterState(snapshotId, filters, {
      queryOptions,
      changedFilter,
      includeUserFilter,
    });
    resolvedFilters = resolved.filters;
    filterOptions = resolved.filterOptions;
  } catch (error) {
    logDbError(errorMessage, error);
  }

  return { filters: resolvedFilters, filterOptions };
}

export function normaliseDateRange(range?: { from?: Date; to?: Date }): { from?: Date; to?: Date } | undefined {
  if (!range?.from && !range?.to) {
    return undefined;
  }
  let { from, to } = range;
  if (from && to && from > to) {
    [from, to] = [to, from];
  }
  return { from, to };
}

export function resolveDateRangeWithDefaults(options: { from?: Date; to?: Date; daysBack?: number }): {
  from: Date;
  to: Date;
} {
  const now = new Date();
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setDate(defaultFrom.getDate() - (options.daysBack ?? 30));
  let from = options.from ?? defaultFrom;
  let to = options.to ?? defaultTo;
  if (from > to) {
    [from, to] = [to, from];
  }
  return { from, to };
}

export function settledValueWithError<T>(result: PromiseSettledResult<T>, errorMessage: string): T | null {
  return settledValue(result, reason => logDbError(errorMessage, reason));
}

export function settledValueWithFallback<T>(
  result: PromiseSettledResult<T | null>,
  errorMessage: string,
  fallback: T
): T {
  const value = settledValueWithError(result, errorMessage);
  return value ?? fallback;
}

export function settledArrayWithFallback<T>(
  result: PromiseSettledResult<T[]>,
  errorMessage: string,
  fallback: T[]
): T[] {
  const value = settledValueWithError(result, errorMessage);
  return value && value.length > 0 ? value : fallback;
}
