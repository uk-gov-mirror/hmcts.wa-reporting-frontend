import {
  areFacetFiltersEqual,
  getFacetFilterKeys,
  mergeFacetFilters,
  parseChangedFacetFilter,
  pickFacetFilters,
} from '../../../../../main/modules/analytics/shared/filters/facets';

describe('facets filters helpers', () => {
  test('returns facet keys with and without user filter', () => {
    expect(getFacetFilterKeys()).toEqual([
      'service',
      'roleCategory',
      'region',
      'location',
      'workType',
      'taskName',
      'user',
    ]);
    expect(getFacetFilterKeys(true)).toEqual([
      'service',
      'roleCategory',
      'region',
      'location',
      'workType',
      'taskName',
      'user',
    ]);
    expect(getFacetFilterKeys(false)).toEqual([
      'service',
      'roleCategory',
      'region',
      'location',
      'workType',
      'taskName',
    ]);
  });

  test('parses changed facet filter using includeUserFilter options', () => {
    expect(parseChangedFacetFilter(' service ', { includeUserFilter: false })).toBe('service');
    expect(parseChangedFacetFilter('user', { includeUserFilter: false })).toBeUndefined();
    expect(parseChangedFacetFilter('user')).toBe('user');
    expect(parseChangedFacetFilter(42)).toBeUndefined();
  });

  test('picks and merges facet filters with value normalisation', () => {
    const picked = pickFacetFilters(
      {
        service: [' Civil ', '', 'Civil'],
        roleCategory: ['Ops'],
        user: ['  ', '123'],
        taskName: [],
      },
      { includeUserFilter: true }
    );

    expect(picked).toEqual({
      service: ['Civil'],
      roleCategory: ['Ops'],
      user: ['123'],
    });

    const merged = mergeFacetFilters(
      { service: ['Old'], region: ['North'], user: ['OldUser'] },
      { service: ['Civil'], taskName: ['Review'] },
      { includeUserFilter: false }
    );

    expect(merged).toEqual({
      service: ['Civil'],
      taskName: ['Review'],
    });
    expect(merged.user).toBeUndefined();
  });

  test('uses default includeUserFilter=true behaviour when options are omitted', () => {
    const picked = pickFacetFilters({
      service: ['Civil'],
      user: ['A123'],
      roleCategory: ['   '],
    });
    expect(picked).toEqual({
      service: ['Civil'],
      user: ['A123'],
    });

    const merged = mergeFacetFilters({ service: ['Old'], user: ['OldUser'] }, { service: ['Civil'] });
    expect(merged).toEqual({ service: ['Civil'] });
  });

  test('compares facet filter equality by key ordering and values', () => {
    expect(
      areFacetFiltersEqual(
        { service: ['Civil'], roleCategory: ['Ops'] },
        { service: ['Civil'], roleCategory: ['Ops'] },
        { includeUserFilter: false }
      )
    ).toBe(true);

    expect(
      areFacetFiltersEqual({ service: ['Civil', 'Crime'] }, { service: ['Civil'] }, { includeUserFilter: false })
    ).toBe(false);

    expect(
      areFacetFiltersEqual(
        { service: ['Civil'], user: ['123'] },
        { service: ['Civil'], user: ['456'] },
        { includeUserFilter: true }
      )
    ).toBe(false);

    expect(areFacetFiltersEqual({ service: ['Civil'], user: ['123'] }, { service: ['Civil'], user: ['123'] })).toBe(
      true
    );
  });
});
