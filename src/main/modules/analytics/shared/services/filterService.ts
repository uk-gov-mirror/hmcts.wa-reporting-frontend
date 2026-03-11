import { CacheKeys, buildSnapshotScopedCacheKey, getCache, setCache } from '../cache/cache';
import {
  FacetFilterKey,
  areFacetFiltersEqual,
  getFacetFilterKeys,
  mergeFacetFilters,
  pickFacetFilters,
} from '../filters';
import { taskFactsRepository } from '../repositories';
import type { CaseWorkerProfileRow } from '../repositories';
import type { AnalyticsQueryOptions } from '../repositories/filters';
import type { AnalyticsFilters } from '../types';
import type { SelectOption } from '../viewModels/filterOptions';

import { caseWorkerProfileService, courtVenueService, regionService } from './index';

export type FilterOptions = {
  services: string[];
  roleCategories: string[];
  regions: SelectOption[];
  locations: SelectOption[];
  taskNames: string[];
  workTypes: SelectOption[];
  users: SelectOption[];
};

export type FacetedFilterState = {
  filters: AnalyticsFilters;
  filterOptions: FilterOptions;
};

const compareByText = (a: SelectOption, b: SelectOption) => a.text.localeCompare(b.text);

function buildUserOptions(assigneeIds: string[], profiles: CaseWorkerProfileRow[]): SelectOption[] {
  const normalisedAssignees = new Set(assigneeIds);
  const options = profiles
    .filter(profile => normalisedAssignees.has(profile.case_worker_id))
    .map(profile => {
      const fullName = [profile.first_name, profile.last_name].join(' ');
      const displayName = `${fullName} (${profile.email_id})`;
      return { value: profile.case_worker_id, text: displayName };
    })
    .sort(compareByText);

  return [{ value: '', text: 'All users' }, ...options];
}

function buildRegionOptions(
  regionIds: string[],
  regionRecords: { region_id: string; description: string }[]
): SelectOption[] {
  const descriptions = regionRecords.reduce<Record<string, string>>((acc, region) => {
    acc[region.region_id] = region.description;
    return acc;
  }, {});
  const options = regionIds
    .map(regionId => ({
      value: regionId,
      text: regionId === '' ? '(Blank)' : (descriptions[regionId] ?? regionId),
    }))
    .sort(compareByText);
  return [{ value: '', text: 'All regions' }, ...options];
}

function buildLocationOptions(
  locationIds: string[],
  courtVenues: { epimms_id: string; site_name: string }[]
): SelectOption[] {
  const descriptions = courtVenues.reduce<Record<string, string>>((acc, venue) => {
    acc[venue.epimms_id] = venue.site_name;
    return acc;
  }, {});
  const options = locationIds
    .map(locationId => ({
      value: locationId,
      text: locationId === '' ? '(Blank)' : (descriptions[locationId] ?? locationId),
    }))
    .sort(compareByText);
  return [{ value: '', text: 'All locations' }, ...options];
}

function buildQueryOptionsCacheSignature(queryOptions?: AnalyticsQueryOptions): string {
  const excluded = queryOptions?.excludeRoleCategories;
  if (!excluded || excluded.length === 0) {
    return 'default';
  }
  const normalised = [...new Set(excluded.map(value => value.trim().toUpperCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (normalised.length === 0) {
    return 'default';
  }
  return `excludeRoleCategories=${normalised.join(',')}`;
}

function buildFilterValuesCacheSignature(filters: AnalyticsFilters, includeUserFilter: boolean): string {
  const facetFilters = pickFacetFilters(filters, { includeUserFilter });
  const signatureParts = getFacetFilterKeys(includeUserFilter)
    .map(key => {
      const values = facetFilters[key];
      if (!values || values.length === 0) {
        return null;
      }
      const normalised = [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      );
      if (normalised.length === 0) {
        return null;
      }
      return `${key}=${normalised.join(',')}`;
    })
    .filter((part): part is string => part !== null);

  return signatureParts.length > 0 ? signatureParts.join(';') : 'none';
}

function buildFilterOptionsCacheSignature(
  filters: AnalyticsFilters,
  queryOptions: AnalyticsQueryOptions | undefined,
  includeUserFilter: boolean
): string {
  const filterSignature = buildFilterValuesCacheSignature(filters, includeUserFilter);
  const queryOptionsSignature = buildQueryOptionsCacheSignature(queryOptions);
  return `includeUser=${includeUserFilter ? '1' : '0'}|filters=${filterSignature}|query=${queryOptionsSignature}`;
}

function optionValues(values: SelectOption[] | string[]): Set<string> {
  if (values.length === 0) {
    return new Set<string>();
  }
  const mapped =
    typeof values[0] === 'string' ? (values as string[]) : (values as SelectOption[]).map(value => value.value);
  return new Set(mapped.map(value => value.trim()).filter(value => value.length > 0));
}

function canonicaliseFacetFilters(
  filters: AnalyticsFilters,
  filterOptions: FilterOptions,
  changedFilter: FacetFilterKey | undefined,
  includeUserFilter: boolean
): AnalyticsFilters {
  if (!changedFilter || !getFacetFilterKeys(includeUserFilter).includes(changedFilter)) {
    return filters;
  }

  const optionsByFacet: Record<FacetFilterKey, Set<string>> = {
    service: optionValues(filterOptions.services),
    roleCategory: optionValues(filterOptions.roleCategories),
    region: optionValues(filterOptions.regions),
    location: optionValues(filterOptions.locations),
    taskName: optionValues(filterOptions.taskNames),
    workType: optionValues(filterOptions.workTypes),
    user: optionValues(filterOptions.users),
  };

  const canonicalFilters: AnalyticsFilters = { ...filters };
  getFacetFilterKeys(includeUserFilter).forEach(key => {
    if (key === changedFilter) {
      return;
    }
    const values = canonicalFilters[key];
    if (!values || values.length === 0) {
      return;
    }
    const allowedValues = optionsByFacet[key];
    const filteredValues = values.filter(value => allowedValues.has(value));
    if (filteredValues.length === 0) {
      delete canonicalFilters[key];
      return;
    }
    canonicalFilters[key] = filteredValues;
  });

  return canonicalFilters;
}

class FilterService {
  private async fetchFilterOptionsForFilters(
    snapshotId: number,
    filters: AnalyticsFilters,
    queryOptions: AnalyticsQueryOptions | undefined,
    includeUserFilter: boolean
  ): Promise<FilterOptions> {
    const cacheKey = buildSnapshotScopedCacheKey(
      CacheKeys.filterOptions,
      snapshotId,
      buildFilterOptionsCacheSignature(filters, queryOptions, includeUserFilter)
    );
    const cached = getCache<FilterOptions>(cacheKey);
    if (cached) {
      return cached;
    }

    const [rawOptions, regionRecords, courtVenues, profiles] = await Promise.all([
      taskFactsRepository.fetchOverviewFilterOptionsRows(snapshotId, {
        filters,
        queryOptions,
        includeUserFilter,
      }),
      regionService.fetchRegions(),
      courtVenueService.fetchCourtVenues(),
      includeUserFilter ? caseWorkerProfileService.fetchCaseWorkerProfiles() : Promise.resolve([]),
    ]);

    const { services, roleCategories, regions, locations, taskNames, workTypes, assignees } = rawOptions;
    const userOptions = includeUserFilter
      ? buildUserOptions(
          assignees.map(row => row.value),
          profiles
        )
      : [];
    const regionOptions = buildRegionOptions(
      regions.map(row => row.value),
      regionRecords
    );
    const locationOptions = buildLocationOptions(
      locations.map(row => row.value),
      courtVenues
    );

    const options = {
      services: services.map(row => row.value),
      roleCategories: roleCategories.map(row => row.value),
      regions: regionOptions,
      locations: locationOptions,
      taskNames: taskNames.map(row => row.value),
      workTypes: workTypes.map(row => ({ value: row.value, text: row.text })),
      users: userOptions,
    };

    setCache(cacheKey, options);
    return options;
  }

  async fetchFilterOptions(snapshotId: number, queryOptions?: AnalyticsQueryOptions): Promise<FilterOptions> {
    return this.fetchFilterOptionsForFilters(snapshotId, {}, queryOptions, true);
  }

  async fetchFacetedFilterState(
    snapshotId: number,
    filters: AnalyticsFilters,
    params?: {
      queryOptions?: AnalyticsQueryOptions;
      changedFilter?: FacetFilterKey;
      includeUserFilter?: boolean;
    }
  ): Promise<FacetedFilterState> {
    const includeUserFilter = params?.includeUserFilter ?? true;
    const facetFilters = pickFacetFilters(filters, { includeUserFilter });

    const initialFilterOptions = await this.fetchFilterOptionsForFilters(
      snapshotId,
      facetFilters,
      params?.queryOptions,
      includeUserFilter
    );
    const canonicalFacetFilters = canonicaliseFacetFilters(
      facetFilters,
      initialFilterOptions,
      params?.changedFilter,
      includeUserFilter
    );

    const finalFilterOptions = areFacetFiltersEqual(facetFilters, canonicalFacetFilters, { includeUserFilter })
      ? initialFilterOptions
      : await this.fetchFilterOptionsForFilters(
          snapshotId,
          canonicalFacetFilters,
          params?.queryOptions,
          includeUserFilter
        );

    const mergedFilters = mergeFacetFilters(filters, canonicalFacetFilters, { includeUserFilter });
    return {
      filters: mergedFilters,
      filterOptions: finalFilterOptions,
    };
  }
}

export const filterService = new FilterService();
