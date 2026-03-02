/* @jest-environment jsdom */
import {
  clearLocationHash,
  getAnalyticsFiltersForm,
  getScrollStorageKey,
  initAutoSubmitForms,
  initFacetedFilterAutoRefresh,
  initFilterPersistence,
  initMultiSelects,
  normaliseMultiSelectSelections,
  restoreScrollPosition,
  setHiddenInput,
  storeScrollPosition,
} from '../../../../main/assets/js/analytics/forms';

import { setupAnalyticsDom } from './analyticsTestUtils';

describe('analytics forms', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    setupAnalyticsDom();
  });

  test('stores scroll position and restores it once', () => {
    storeScrollPosition();

    const key = getScrollStorageKey();
    expect(window.sessionStorage.getItem(key)).toBe('120');

    restoreScrollPosition();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 120, left: 0, behavior: 'auto' });
    expect(window.sessionStorage.getItem(key)).toBeNull();

    restoreScrollPosition();
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  test('does not scroll when stored scroll position is invalid', () => {
    const key = getScrollStorageKey();
    window.sessionStorage.setItem(key, 'not-a-number');

    restoreScrollPosition();

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  test('warns when scroll position storage operations fail', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const storeError = new Error('blocked-store');
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw storeError;
    });

    storeScrollPosition();
    expect(warnSpy).toHaveBeenCalledWith('Failed to store scroll position', storeError);
    setItemSpy.mockRestore();

    const restoreError = new Error('blocked-restore');
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw restoreError;
    });

    restoreScrollPosition();
    expect(warnSpy).toHaveBeenCalledWith('Failed to restore scroll position', restoreError);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    getItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('finds analytics filter forms and updates hidden inputs', () => {
    expect(getAnalyticsFiltersForm()).toBeNull();

    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    document.body.appendChild(form);

    expect(getAnalyticsFiltersForm()).toBe(form);

    setHiddenInput(form, 'test', 'value-1');
    setHiddenInput(form, 'test', 'value-2');
    const input = form.querySelector<HTMLInputElement>('input[name="test"]');
    expect(input?.value).toBe('value-2');
  });

  test('normalises multi-select selections on filter submit', () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';

    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.innerHTML = `
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="North" checked />
      </div>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="South" checked />
      </div>
      <input type="checkbox" data-select-all="true" checked />
    `;
    form.appendChild(details);
    document.body.appendChild(form);

    initFilterPersistence();
    form.dispatchEvent(new Event('submit', { bubbles: true }));

    const items = details.querySelectorAll<HTMLInputElement>('[data-multiselect-item]');
    expect(items[0].checked).toBe(false);
    expect(items[1].checked).toBe(false);
    const selectAll = details.querySelector<HTMLInputElement>('[data-select-all]');
    expect(selectAll?.checked).toBe(false);
  });

  test('clears URL hash on non-ajax filter submit', () => {
    window.history.replaceState({}, '', '/outstanding?service=Crime#openTasksTable');

    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    document.body.appendChild(form);

    initFilterPersistence();
    form.dispatchEvent(new Event('submit', { bubbles: true }));

    expect(window.location.pathname).toBe('/outstanding');
    expect(window.location.search).toBe('?service=Crime');
    expect(window.location.hash).toBe('');
  });

  test('does not clear URL hash on ajax section filter submit', () => {
    window.history.replaceState({}, '', '/outstanding?service=Crime#openTasksTable');

    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.dataset.ajaxSection = 'open-tasks-summary';
    document.body.appendChild(form);

    initFilterPersistence();
    form.dispatchEvent(new Event('submit', { bubbles: true }));

    expect(window.location.hash).toBe('#openTasksTable');
  });

  test('clearLocationHash is a no-op when hash is absent', () => {
    window.history.replaceState({}, '', '/outstanding?service=Crime');
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    clearLocationHash();

    expect(replaceStateSpy).not.toHaveBeenCalled();
    replaceStateSpy.mockRestore();
  });

  test('clearLocationHash handles missing/throwing replaceState safely', () => {
    window.history.replaceState({}, '', '/outstanding?service=Crime#openTasksTable');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalReplaceState = window.history.replaceState;

    Object.defineProperty(window.history, 'replaceState', {
      configurable: true,
      value: undefined,
    });
    clearLocationHash();
    expect(window.location.hash).toBe('#openTasksTable');

    Object.defineProperty(window.history, 'replaceState', {
      configurable: true,
      value: () => {
        throw new Error('replace-state-failed');
      },
    });
    clearLocationHash();
    expect(warnSpy).toHaveBeenCalledWith('Failed to clear URL hash', expect.any(Error));

    Object.defineProperty(window.history, 'replaceState', {
      configurable: true,
      value: originalReplaceState,
    });
    warnSpy.mockRestore();
  });

  test('normaliseMultiSelectSelections leaves partial selections unchanged', () => {
    const form = document.createElement('form');
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.innerHTML = `
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="A" checked />
      </div>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="B" />
      </div>
    `;
    form.appendChild(details);

    normaliseMultiSelectSelections(form);

    const items = details.querySelectorAll<HTMLInputElement>('[data-multiselect-item]');
    expect(items[0].checked).toBe(true);
    expect(items[1].checked).toBe(false);
  });

  test('normaliseMultiSelectSelections ignores groups without selectable items', () => {
    const form = document.createElement('form');
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    form.appendChild(details);

    expect(() => normaliseMultiSelectSelections(form)).not.toThrow();
  });

  test('normaliseMultiSelectSelections clears all-selected items even without a select-all control', () => {
    const form = document.createElement('form');
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.innerHTML = `
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="A" checked />
      </div>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="B" checked />
      </div>
    `;
    form.appendChild(details);

    normaliseMultiSelectSelections(form);
    const items = details.querySelectorAll<HTMLInputElement>('[data-multiselect-item]');
    expect(items[0].checked).toBe(false);
    expect(items[1].checked).toBe(false);
  });

  test('updates multiselect summaries and handles focus escape', () => {
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.open = true;
    details.innerHTML = `
      <summary data-multiselect-summary="true">All</summary>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="One" />
      </div>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="Two" data-item-label="Label Two" />
      </div>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="Three" />
      </div>
      <input type="checkbox" data-select-all="true" />
      <input type="text" data-multiselect-search="true" value="" />
      <span data-multiselect-search-count="true"></span>
    `;
    document.body.appendChild(details);

    initMultiSelects();
    const selectAll = details.querySelector<HTMLInputElement>('[data-select-all="true"]');
    if (selectAll) {
      selectAll.checked = true;
      selectAll.dispatchEvent(new Event('change'));
    }
    const summary = details.querySelector('[data-multiselect-summary="true"]');
    expect(summary?.textContent).toBe('All');

    const singleOptionDetails = document.createElement('details');
    singleOptionDetails.dataset.module = 'analytics-multiselect';
    singleOptionDetails.dataset.allText = 'All';
    singleOptionDetails.innerHTML = `
      <summary data-multiselect-summary="true">All</summary>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="London" data-item-label="London" checked />
      </div>
      <input type="checkbox" data-select-all="true" checked />
    `;
    document.body.appendChild(singleOptionDetails);
    initMultiSelects();
    singleOptionDetails.dispatchEvent(new Event('toggle'));
    expect(singleOptionDetails.querySelector('[data-multiselect-summary="true"]')?.textContent).toBe('London');

    const searchInput = details.querySelector<HTMLInputElement>('[data-multiselect-search="true"]');
    if (searchInput) {
      searchInput.value = 'two';
      searchInput.dispatchEvent(new Event('input'));
    }
    expect(details.querySelector('[data-multiselect-search-count="true"]')?.textContent).toContain('1 of 3');

    if (searchInput) {
      searchInput.value = 'missing';
      searchInput.dispatchEvent(new Event('input'));
    }
    expect(details.querySelector('[data-multiselect-search-count="true"]')?.textContent).toContain(
      'No matching options'
    );

    const items = details.querySelectorAll<HTMLInputElement>('[data-multiselect-item]');
    if (searchInput) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
    }
    if (selectAll) {
      selectAll.checked = false;
      selectAll.dispatchEvent(new Event('change'));
    }
    items[0].checked = true;
    items[0].dispatchEvent(new Event('change', { bubbles: true }));
    expect(summary?.textContent).toBe('One');
    items[1].checked = true;
    items[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(summary?.textContent).toContain('selected');

    const noSummaryDetails = document.createElement('details');
    noSummaryDetails.dataset.module = 'analytics-multiselect';
    noSummaryDetails.innerHTML = `
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="Only" />
      </div>
    `;
    document.body.appendChild(noSummaryDetails);
    initMultiSelects();

    const orphanDetails = document.createElement('details');
    orphanDetails.dataset.module = 'analytics-multiselect';
    orphanDetails.innerHTML = '<input type="checkbox" data-multiselect-item="true" value="Orphan" />';
    document.body.appendChild(orphanDetails);
    initMultiSelects();

    const noSearchDetails = document.createElement('details');
    noSearchDetails.dataset.module = 'analytics-multiselect';
    noSearchDetails.innerHTML = `
      <summary data-multiselect-summary="true">All</summary>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="One" />
      </div>
      <input type="checkbox" data-select-all="true" />
    `;
    document.body.appendChild(noSearchDetails);
    initMultiSelects();

    details.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(details.open).toBe(false);

    details.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    details.open = true;
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(details.open).toBe(false);
  });

  test('keeps multiselect open for internal clicks and closes on outside click', () => {
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.open = true;
    details.innerHTML = `
      <summary data-multiselect-summary="true">All</summary>
      <div class="analytics-multiselect__panel">
        <div class="govuk-checkboxes__item">
          <input id="region-1" type="checkbox" data-multiselect-item="true" value="London" />
          <label for="region-1">London</label>
        </div>
      </div>
    `;
    document.body.appendChild(details);

    initMultiSelects();

    const panel = details.querySelector('.analytics-multiselect__panel');
    panel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(details.open).toBe(true);

    const optionLabel = details.querySelector('label[for="region-1"]');
    optionLabel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const option = details.querySelector<HTMLInputElement>('#region-1');
    expect(option?.checked).toBe(true);
    expect(details.open).toBe(true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(details.open).toBe(false);
  });

  test('auto-submits filter forms on checkbox changes', () => {
    const form = document.createElement('form');
    form.dataset.autoSubmit = 'true';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    form.appendChild(checkbox);
    form.requestSubmit = jest.fn();
    document.body.appendChild(form);

    const fallbackForm = document.createElement('form');
    fallbackForm.dataset.autoSubmit = 'true';
    const fallbackCheckbox = document.createElement('input');
    fallbackCheckbox.type = 'checkbox';
    fallbackForm.appendChild(fallbackCheckbox);
    fallbackForm.requestSubmit = undefined as unknown as HTMLFormElement['requestSubmit'];
    const submitSpy = jest.spyOn(fallbackForm, 'submit').mockImplementation(() => {});
    document.body.appendChild(fallbackForm);

    initAutoSubmitForms();
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    fallbackCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(form.requestSubmit).toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalled();
  });

  test('does not auto-submit for non-checkbox/radio changes', () => {
    const form = document.createElement('form');
    form.dataset.autoSubmit = 'true';
    const text = document.createElement('input');
    text.type = 'text';
    form.appendChild(text);
    form.requestSubmit = jest.fn();
    document.body.appendChild(form);

    initAutoSubmitForms();
    text.dispatchEvent(new Event('change', { bubbles: true }));

    expect(form.requestSubmit).not.toHaveBeenCalled();
  });

  test('skips rebinding auto-submit listeners when already bound', () => {
    const form = document.createElement('form');
    form.dataset.autoSubmit = 'true';
    form.dataset.autoSubmitBound = 'true';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    form.appendChild(checkbox);
    form.requestSubmit = jest.fn();
    document.body.appendChild(form);

    initAutoSubmitForms();
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(form.requestSubmit).not.toHaveBeenCalled();
  });

  test('skips rebinding filter persistence when already bound', () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.dataset.analyticsFiltersBound = 'true';
    document.body.appendChild(form);

    initFilterPersistence();
    form.dispatchEvent(new Event('submit', { bubbles: true }));

    expect(form.dataset.analyticsFiltersBound).toBe('true');
  });

  test('refreshes shared filters when a changed multiselect closes', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.dataset.filterKey = 'service';
    details.open = true;
    details.innerHTML = `
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="A" />
      </div>
    `;
    form.appendChild(details);
    document.body.appendChild(form);

    const refreshSharedFilters = jest.fn().mockResolvedValue(undefined);
    initFacetedFilterAutoRefresh(refreshSharedFilters);

    const checkbox = details.querySelector<HTMLInputElement>('[data-multiselect-item="true"]');
    checkbox?.dispatchEvent(new Event('change', { bubbles: true }));

    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    await Promise.resolve();

    expect(refreshSharedFilters).toHaveBeenCalledWith(form, 'service');
  });

  test('refreshes shared filters on focusout when selection changed and details is closed', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.dataset.filterKey = 'region';
    details.open = true;
    details.innerHTML = `
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="North" />
      </div>
    `;
    form.appendChild(details);
    document.body.appendChild(form);

    const refreshSharedFilters = jest.fn().mockResolvedValue(undefined);
    initFacetedFilterAutoRefresh(refreshSharedFilters);

    const checkbox = details.querySelector<HTMLInputElement>('[data-multiselect-item="true"]');
    checkbox?.dispatchEvent(new Event('change', { bubbles: true }));

    details.open = false;
    details.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await Promise.resolve();

    expect(refreshSharedFilters).toHaveBeenCalledWith(form, 'region');
  });

  test('does not bind facet auto-refresh for bound or keyless multiselects', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';

    const boundDetails = document.createElement('details');
    boundDetails.dataset.module = 'analytics-multiselect';
    boundDetails.dataset.filterKey = 'service';
    boundDetails.dataset.facetRefreshBound = 'true';
    form.appendChild(boundDetails);

    const keylessDetails = document.createElement('details');
    keylessDetails.dataset.module = 'analytics-multiselect';
    form.appendChild(keylessDetails);

    document.body.appendChild(form);

    const refreshSharedFilters = jest.fn().mockResolvedValue(undefined);
    initFacetedFilterAutoRefresh(refreshSharedFilters);

    boundDetails.dispatchEvent(new Event('toggle'));
    keylessDetails.dispatchEvent(new Event('toggle'));
    await Promise.resolve();

    expect(refreshSharedFilters).not.toHaveBeenCalled();
    expect(boundDetails.dataset.facetRefreshBound).toBe('true');
    expect(keylessDetails.dataset.facetRefreshBound).toBeUndefined();
  });

  test('ignores non-selection events and inside focus transitions for facet auto-refresh', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.dataset.filterKey = 'taskName';
    details.open = true;
    details.innerHTML = `
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="A" />
      </div>
      <button type="button" class="inside">inside</button>
    `;
    form.appendChild(details);
    document.body.appendChild(form);

    const refreshSharedFilters = jest.fn().mockResolvedValue(undefined);
    initFacetedFilterAutoRefresh(refreshSharedFilters);

    details.dispatchEvent(new Event('change', { bubbles: true }));
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    await Promise.resolve();
    expect(refreshSharedFilters).not.toHaveBeenCalled();

    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    await Promise.resolve();
    expect(refreshSharedFilters).not.toHaveBeenCalled();

    const checkbox = details.querySelector<HTMLInputElement>('[data-multiselect-item="true"]');
    checkbox?.dispatchEvent(new Event('change', { bubbles: true }));
    details.dispatchEvent(
      new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: details.querySelector('.inside') as HTMLElement,
      })
    );
    await Promise.resolve();
    expect(refreshSharedFilters).not.toHaveBeenCalled();
  });

  test('supports select-all changes for facet auto-refresh and does not refresh while still open', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.dataset.filterKey = 'workType';
    details.open = true;
    details.innerHTML = `
      <input type="checkbox" data-select-all="true" />
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="A" />
      </div>
    `;
    form.appendChild(details);
    document.body.appendChild(form);

    const refreshSharedFilters = jest.fn().mockResolvedValue(undefined);
    initFacetedFilterAutoRefresh(refreshSharedFilters);

    const selectAll = details.querySelector<HTMLInputElement>('[data-select-all="true"]');
    selectAll?.dispatchEvent(new Event('change', { bubbles: true }));
    details.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await Promise.resolve();
    expect(refreshSharedFilters).not.toHaveBeenCalled();

    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    await Promise.resolve();
    expect(refreshSharedFilters).toHaveBeenCalledWith(form, 'workType');
  });

  test('closes multiselect using fallback contains check when composedPath is unavailable', () => {
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.open = true;
    details.innerHTML = `
      <summary data-multiselect-summary="true">All</summary>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="One" />
      </div>
    `;
    document.body.appendChild(details);
    initMultiSelects();

    const outsideClick = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(outsideClick, 'composedPath', { configurable: true, value: undefined });
    document.body.dispatchEvent(outsideClick);

    expect(details.open).toBe(false);
  });

  test('handles searchable multiselects without a search-count element', () => {
    const details = document.createElement('details');
    details.dataset.module = 'analytics-multiselect';
    details.innerHTML = `
      <summary data-multiselect-summary="true">All</summary>
      <div class="govuk-checkboxes__item">
        <input type="checkbox" data-multiselect-item="true" value="One" />
      </div>
      <input type="text" data-multiselect-search="true" value="" />
    `;
    document.body.appendChild(details);

    initMultiSelects();
    const search = details.querySelector<HTMLInputElement>('[data-multiselect-search="true"]');
    search!.value = 'one';
    search!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(details.querySelectorAll('.govuk-checkboxes__item')[0]?.getAttribute('aria-hidden')).toBe('false');
  });
});
