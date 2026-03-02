/* @jest-environment jsdom */
import { initAll as initMojAll } from '@ministryofjustice/frontend';
import { initAll } from 'govuk-frontend';

import {
  fetchPaginatedSection,
  fetchSectionUpdate,
  fetchSharedFiltersUpdate,
  fetchSortedSection,
  initAjaxFilterSections,
  initAjaxInitialSections,
} from '../../../../main/assets/js/analytics/ajax';
import { renderCharts } from '../../../../main/assets/js/analytics/charts';
import {
  initAutoSubmitForms,
  initFacetedFilterAutoRefresh,
  initFilterPersistence,
  initMultiSelects,
  restoreScrollPosition,
} from '../../../../main/assets/js/analytics/forms';
import { initOpenByName } from '../../../../main/assets/js/analytics/outstanding/openByName';
import {
  initCriticalTasksPagination,
  initUserOverviewPagination,
} from '../../../../main/assets/js/analytics/pagination';
import {
  initMojServerSorting,
  initMojTotalsRowPinning,
  initTableExports,
} from '../../../../main/assets/js/analytics/tables';

import { setupAnalyticsDom } from './analyticsTestUtils';

jest.mock('govuk-frontend', () => ({ initAll: jest.fn() }));
jest.mock('@ministryofjustice/frontend', () => ({ initAll: jest.fn() }));
jest.mock('../../../../main/assets/js/analytics/ajax', () => ({
  fetchSharedFiltersUpdate: jest.fn(),
  fetchPaginatedSection: jest.fn(),
  fetchSectionUpdate: jest.fn(),
  fetchSortedSection: jest.fn(),
  initAjaxInitialSections: jest.fn(),
  initAjaxFilterSections: jest.fn(),
}));
jest.mock('../../../../main/assets/js/analytics/charts', () => ({ renderCharts: jest.fn() }));
jest.mock('../../../../main/assets/js/analytics/forms', () => ({
  initAutoSubmitForms: jest.fn(),
  initFacetedFilterAutoRefresh: jest.fn(),
  initFilterPersistence: jest.fn(),
  initMultiSelects: jest.fn(),
  restoreScrollPosition: jest.fn(),
}));
jest.mock('../../../../main/assets/js/analytics/outstanding/openByName', () => ({
  initOpenByName: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../main/assets/js/analytics/pagination', () => ({
  initCriticalTasksPagination: jest.fn(),
  initUserOverviewPagination: jest.fn(),
}));
jest.mock('../../../../main/assets/js/analytics/tables', () => ({
  initMojServerSorting: jest.fn(),
  initMojTotalsRowPinning: jest.fn(),
  initTableExports: jest.fn(),
}));

import '../../../../main/assets/js/analytics';

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('analytics bootstrap', () => {
  beforeEach(() => {
    setupAnalyticsDom();
    (fetchSharedFiltersUpdate as jest.Mock).mockClear();
    (fetchPaginatedSection as jest.Mock).mockClear();
    (fetchSectionUpdate as jest.Mock).mockClear();
    (fetchSortedSection as jest.Mock).mockClear();
    (initAjaxInitialSections as jest.Mock).mockClear();
    (initAjaxFilterSections as jest.Mock).mockClear();
    (renderCharts as jest.Mock).mockClear();
    (initAutoSubmitForms as jest.Mock).mockClear();
    (initFacetedFilterAutoRefresh as jest.Mock).mockClear();
    (initFilterPersistence as jest.Mock).mockClear();
    (initMultiSelects as jest.Mock).mockClear();
    (restoreScrollPosition as jest.Mock).mockClear();
    (initOpenByName as jest.Mock).mockClear();
    (initCriticalTasksPagination as jest.Mock).mockClear();
    (initUserOverviewPagination as jest.Mock).mockClear();
    (initMojServerSorting as jest.Mock).mockClear();
    (initTableExports as jest.Mock).mockClear();
    (initMojTotalsRowPinning as jest.Mock).mockClear();
  });

  test('runs DOMContentLoaded bootstrap without throwing', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    expect(initMojAll).not.toHaveBeenCalled();
    expect(renderCharts).toHaveBeenCalled();
    expect(initTableExports).toHaveBeenCalled();
    expect(initMojServerSorting).toHaveBeenCalledWith(expect.any(Function));
    expect(initMojTotalsRowPinning).toHaveBeenCalled();
    expect(initCriticalTasksPagination).toHaveBeenCalledWith(expect.any(Function));
    expect(initUserOverviewPagination).toHaveBeenCalledWith(expect.any(Function));
    expect(initMultiSelects).toHaveBeenCalled();
    expect(initFilterPersistence).toHaveBeenCalled();
    expect(initFacetedFilterAutoRefresh).toHaveBeenCalledWith(expect.any(Function));
    expect(initOpenByName).toHaveBeenCalled();
    expect(initAjaxFilterSections).toHaveBeenCalledWith(expect.any(Function));
    expect(initAjaxInitialSections).toHaveBeenCalledWith(expect.any(Function));
    expect(initAutoSubmitForms).toHaveBeenCalled();
    expect(restoreScrollPosition).toHaveBeenCalled();
    expect(window.Plotly).toBeDefined();
  });

  test('wraps ajax helpers with dependencies and rebinds behaviors', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const fetchSectionUpdateWithDeps = (initAjaxFilterSections as jest.Mock).mock.calls[0][0];
    const fetchSortedSectionWithDeps = (initMojServerSorting as jest.Mock).mock.calls[0][0];
    const fetchPaginatedSectionWithDeps = (initCriticalTasksPagination as jest.Mock).mock.calls[0][0];
    const fetchSharedFiltersWithDeps = (initFacetedFilterAutoRefresh as jest.Mock).mock.calls[0][0];

    const form = document.createElement('form');

    await fetchSectionUpdateWithDeps(form, 'summary');
    expect(fetchSectionUpdate).toHaveBeenCalledWith(form, 'summary', expect.any(Object));
    const deps = (fetchSectionUpdate as jest.Mock).mock.calls[0][2] as {
      initAll: typeof initAll;
      initMojAll: typeof initMojAll;
    };
    expect(deps.initAll).toBe(initAll);
    expect(deps.initMojAll).toBe(initMojAll);

    await fetchSortedSectionWithDeps(form, 'assigned', 'section-id');
    expect(fetchSortedSection).toHaveBeenCalledWith(form, 'assigned', 'section-id', expect.any(Object));

    await fetchPaginatedSectionWithDeps(form, 'section-id', 'ajax-section', 'pageParam', '2');
    expect(fetchPaginatedSection).toHaveBeenCalledWith(
      form,
      'section-id',
      'ajax-section',
      'pageParam',
      '2',
      expect.any(Object)
    );

    await fetchSharedFiltersWithDeps(form, 'service');
    expect(fetchSharedFiltersUpdate).toHaveBeenCalledWith(form, 'service', expect.any(Object));

    const depsWithRebind = (fetchSectionUpdate as jest.Mock).mock.calls[0][2] as {
      rebindSectionBehaviors: () => void;
    };
    depsWithRebind.rebindSectionBehaviors();

    expect(renderCharts).toHaveBeenCalledTimes(2);
    expect(initTableExports).toHaveBeenCalledTimes(2);
    expect(initMojServerSorting).toHaveBeenCalledTimes(2);
    expect(initMojServerSorting).toHaveBeenCalledTimes(2);
    expect(initMojTotalsRowPinning).toHaveBeenCalledTimes(2);
    expect(initAjaxFilterSections).toHaveBeenCalledTimes(2);
    expect(initAutoSubmitForms).toHaveBeenCalledTimes(2);
    expect(initFilterPersistence).toHaveBeenCalledTimes(2);
    expect(initFacetedFilterAutoRefresh).toHaveBeenCalledTimes(2);
    expect(initCriticalTasksPagination).toHaveBeenCalledTimes(2);
    expect(initUserOverviewPagination).toHaveBeenCalledTimes(2);
    expect(initOpenByName).toHaveBeenCalledTimes(2);
  });
});
