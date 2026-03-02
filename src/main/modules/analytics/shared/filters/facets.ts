import { AnalyticsFilters } from '../types';

const BASE_FACET_FILTER_KEYS = ['service', 'roleCategory', 'region', 'location', 'workType', 'taskName'] as const;
const USER_FACET_FILTER_KEY = 'user' as const;

export type BaseFacetFilterKey = (typeof BASE_FACET_FILTER_KEYS)[number];
export type FacetFilterKey = BaseFacetFilterKey | typeof USER_FACET_FILTER_KEY;

type FacetFilterState = Pick<AnalyticsFilters, FacetFilterKey>;

function normaliseFilterValues(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const normalised = Array.from(new Set(values.map(value => value.trim()).filter(value => value.length > 0)));
  return normalised.length > 0 ? normalised : undefined;
}

function toFacetKeys(includeUserFilter: boolean): FacetFilterKey[] {
  return includeUserFilter ? [...BASE_FACET_FILTER_KEYS, USER_FACET_FILTER_KEY] : [...BASE_FACET_FILTER_KEYS];
}

export function getFacetFilterKeys(includeUserFilter = true): FacetFilterKey[] {
  return toFacetKeys(includeUserFilter);
}

export function parseChangedFacetFilter(
  value: unknown,
  options?: { includeUserFilter?: boolean }
): FacetFilterKey | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const includeUserFilter = options?.includeUserFilter ?? true;
  const trimmed = value.trim();
  const facetKeys = toFacetKeys(includeUserFilter);
  return facetKeys.includes(trimmed as FacetFilterKey) ? (trimmed as FacetFilterKey) : undefined;
}

export function pickFacetFilters(
  filters: AnalyticsFilters,
  options?: { includeUserFilter?: boolean }
): FacetFilterState {
  const includeUserFilter = options?.includeUserFilter ?? true;
  const picked: FacetFilterState = {};

  toFacetKeys(includeUserFilter).forEach(key => {
    const values = normaliseFilterValues(filters[key]);
    if (values) {
      picked[key] = values;
    }
  });

  return picked;
}

export function mergeFacetFilters(
  filters: AnalyticsFilters,
  facetFilters: FacetFilterState,
  options?: { includeUserFilter?: boolean }
): AnalyticsFilters {
  const includeUserFilter = options?.includeUserFilter ?? true;
  const merged: AnalyticsFilters = { ...filters };

  toFacetKeys(includeUserFilter).forEach(key => {
    delete merged[key];
    const values = facetFilters[key];
    if (values && values.length > 0) {
      merged[key] = values;
    }
  });

  if (!includeUserFilter) {
    delete merged.user;
  }

  return merged;
}

export function areFacetFiltersEqual(
  left: FacetFilterState,
  right: FacetFilterState,
  options?: { includeUserFilter?: boolean }
): boolean {
  const includeUserFilter = options?.includeUserFilter ?? true;
  return toFacetKeys(includeUserFilter).every(key => {
    const leftValues = left[key] ?? [];
    const rightValues = right[key] ?? [];
    if (leftValues.length !== rightValues.length) {
      return false;
    }
    return leftValues.every((value, index) => value === rightValues[index]);
  });
}
