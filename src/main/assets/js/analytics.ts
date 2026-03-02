import { initAll as initMojAll } from '@ministryofjustice/frontend';
import { initAll } from 'govuk-frontend';
import Plotly from 'plotly.js-basic-dist-min';

import {
  fetchPaginatedSection,
  fetchSectionUpdate,
  fetchSharedFiltersUpdate,
  fetchSortedSection,
  initAjaxFilterSections,
  initAjaxInitialSections,
} from './analytics/ajax';
import type { AjaxDeps } from './analytics/ajax';
import { renderCharts } from './analytics/charts';
import {
  initAutoSubmitForms,
  initFacetedFilterAutoRefresh,
  initFilterPersistence,
  initMultiSelects,
  restoreScrollPosition,
} from './analytics/forms';
import { initOpenByName } from './analytics/outstanding/openByName';
import { initCriticalTasksPagination, initUserOverviewPagination } from './analytics/pagination';
import { initMojServerSorting, initMojTotalsRowPinning, initTableExports } from './analytics/tables';

declare global {
  interface Window {
    Plotly?: typeof Plotly;
  }
}

window.Plotly = Plotly;

const rebindSectionBehaviors = (): void => {
  renderCharts();
  initTableExports();
  initMojServerSorting(fetchSortedSectionWithDeps);
  initMojTotalsRowPinning();
  initAjaxFilterSections(fetchSectionUpdateWithDeps);
  initAutoSubmitForms();
  initMultiSelects();
  initFilterPersistence();
  initFacetedFilterAutoRefresh(fetchSharedFiltersWithDeps);
  initCriticalTasksPagination(fetchPaginatedSectionWithDeps);
  initUserOverviewPagination(fetchPaginatedSectionWithDeps);
  void initOpenByName();
};

const ajaxDeps: AjaxDeps = {
  initAll,
  initMojAll,
  rebindSectionBehaviors,
};

const fetchSectionUpdateWithDeps = (form: HTMLFormElement, sectionId: string): Promise<void> =>
  fetchSectionUpdate(form, sectionId, ajaxDeps);

const fetchSortedSectionWithDeps = (form: HTMLFormElement, scope: string, sectionId?: string): Promise<void> =>
  fetchSortedSection(form, scope, sectionId, ajaxDeps);

const fetchPaginatedSectionWithDeps = (
  form: HTMLFormElement,
  sectionId: string,
  ajaxSection: string,
  pageParam: string,
  page: string
): Promise<void> => fetchPaginatedSection(form, sectionId, ajaxSection, pageParam, page, ajaxDeps);

const fetchSharedFiltersWithDeps = (form: HTMLFormElement, changedFilter: string): Promise<void> =>
  fetchSharedFiltersUpdate(form, changedFilter, ajaxDeps);

document.addEventListener('DOMContentLoaded', () => {
  renderCharts();
  initTableExports();
  initMojServerSorting(fetchSortedSectionWithDeps);
  initMojTotalsRowPinning();
  initCriticalTasksPagination(fetchPaginatedSectionWithDeps);
  initUserOverviewPagination(fetchPaginatedSectionWithDeps);
  initMultiSelects();
  initFilterPersistence();
  initFacetedFilterAutoRefresh(fetchSharedFiltersWithDeps);
  void initOpenByName();
  initAjaxFilterSections(fetchSectionUpdateWithDeps);
  initAjaxInitialSections(fetchSectionUpdateWithDeps);
  initAutoSubmitForms();
  restoreScrollPosition();
});
