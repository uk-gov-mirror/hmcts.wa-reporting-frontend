import * as filters from '../../../../../main/modules/analytics/shared/filters';
import { buildSelectOptions } from '../../../../../main/modules/analytics/shared/filters/options';
import { validateFilters } from '../../../../../main/modules/analytics/shared/filters/validator';
import { buildFilterOptionsViewModel } from '../../../../../main/modules/analytics/shared/filters/viewModel';

describe('filters index', () => {
  test('re-exports filter helpers from source modules', () => {
    expect(filters.buildSelectOptions).toBe(buildSelectOptions);
    expect(filters.validateFilters).toBe(validateFilters);
    expect(filters.buildFilterOptionsViewModel).toBe(buildFilterOptionsViewModel);
  });
});
