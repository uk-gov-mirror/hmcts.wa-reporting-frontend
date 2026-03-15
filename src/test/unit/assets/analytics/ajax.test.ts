/* @jest-environment jsdom */
import { initAll as initMojAll } from '@ministryofjustice/frontend';
import { initAll } from 'govuk-frontend';

import type { AjaxDeps } from '../../../../main/assets/js/analytics/ajax';
import {
  browserLocation,
  buildUrlEncodedBody,
  fetchPaginatedSection,
  fetchSectionUpdate,
  fetchSharedFiltersUpdate,
  fetchSortedSection,
  initAjaxFilterSections,
  initAjaxInitialSections,
  postAjaxForm,
} from '../../../../main/assets/js/analytics/ajax';
import { createSectionRequestManager } from '../../../../main/assets/js/analytics/requestManager';

import { setupAnalyticsDom } from './analyticsTestUtils';

jest.mock('govuk-frontend', () => ({ initAll: jest.fn() }));
jest.mock('@ministryofjustice/frontend', () => ({ initAll: jest.fn() }));

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('analytics ajax', () => {
  let ajaxDeps: AjaxDeps;
  const fetchSectionUpdateWithDeps = (form: HTMLFormElement, sectionId: string): Promise<void> =>
    fetchSectionUpdate(form, sectionId, ajaxDeps);

  beforeEach(() => {
    setupAnalyticsDom();
    ajaxDeps = {
      initAll,
      initMojAll,
      rebindSectionBehaviors: jest.fn(),
      requests: createSectionRequestManager(),
    };
  });

  test('renders an inline error instead of full submit when a section request fails', async () => {
    const form = document.createElement('form');
    form.dataset.ajaxSection = 'summary';
    form.action = '/';
    const submitSpy = jest.spyOn(form, 'submit').mockImplementation(() => {});
    document.body.appendChild(form);

    const section = document.createElement('div');
    section.dataset.section = 'summary';
    section.innerHTML = '<p>Existing content</p>';
    document.body.appendChild(section);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await fetchSectionUpdate(form, 'summary', ajaxDeps);

    expect(submitSpy).not.toHaveBeenCalled();
    expect(section.textContent).toContain('This section could not be updated. Try again.');
    expect(section.textContent).toContain('Retry section');
    expect(errorSpy).toHaveBeenCalledWith('Failed to update section', expect.any(Error));
    errorSpy.mockRestore();
  });

  test('retry button re-runs a failed section request', async () => {
    const form = document.createElement('form');
    form.action = '/';
    form.method = 'POST';
    document.body.appendChild(form);

    const section = document.createElement('div');
    section.dataset.section = 'summary';
    document.body.appendChild(section);

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<p>Recovered</p>',
      }) as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await fetchSectionUpdate(form, 'summary', ajaxDeps);
    const retryButton = section.querySelector<HTMLButtonElement>('button');
    retryButton?.click();
    await flushPromises();

    expect(section.innerHTML).toContain('Recovered');
    expect(section.querySelector('[data-section-request-error="true"]')).toBeNull();
    errorSpy.mockRestore();
  });

  test('does not retry again when the retry button is already disabled', async () => {
    const form = document.createElement('form');
    form.action = '/';
    form.method = 'POST';
    document.body.appendChild(form);

    const section = document.createElement('div');
    section.dataset.section = 'summary';
    document.body.appendChild(section);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await fetchSectionUpdate(form, 'summary', ajaxDeps);

    const retryButton = section.querySelector<HTMLButtonElement>('button');
    if (!retryButton) {
      throw new Error('Expected retry button to exist');
    }
    retryButton.disabled = true;
    retryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  test('builds encoded bodies and paginates sections', async () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/outstanding';
    const textInput = document.createElement('input');
    textInput.name = 'search';
    textInput.value = 'alpha';
    form.appendChild(textInput);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.name = 'upload';
    const file = new File(['data'], 'file.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    form.appendChild(fileInput);
    document.body.appendChild(form);

    const originalFormData = FormData;
    class MockFormData {
      private entries: [string, FormDataEntryValue][] = [
        ['search', 'alpha'],
        ['upload', file],
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(_form?: any) {}
      forEach(callback: (value: FormDataEntryValue, key: string) => void): void {
        this.entries.forEach(([key, value]) => callback(value, key));
      }
    }
    global.FormData = MockFormData as unknown as typeof FormData;
    const params = buildUrlEncodedBody(form, { extra: 'value' });
    const paramsWithoutExtra = buildUrlEncodedBody(form);
    global.FormData = originalFormData;
    expect(params.get('search')).toBe('alpha');
    expect(params.get('upload')).toBe('file.txt');
    expect(params.get('extra')).toBe('value');
    expect(paramsWithoutExtra.get('extra')).toBeNull();

    const section = document.createElement('div');
    section.dataset.section = 'outstanding-critical-tasks';
    section.dataset.ajaxLoaded = 'true';
    section.innerHTML = '<p>Existing page</p>';
    document.body.appendChild(section);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<span>page</span>',
    }) as unknown as typeof fetch;

    await fetchPaginatedSection(
      form,
      'outstanding-critical-tasks',
      'criticalTasks',
      'criticalTasksPage',
      '2',
      ajaxDeps
    );
    expect(section.innerHTML).toContain('page');

    const missingTargetForm = document.createElement('form');
    const missingSubmitSpy = jest.spyOn(missingTargetForm, 'submit').mockImplementation(() => {});
    await fetchPaginatedSection(missingTargetForm, 'missing', 'criticalTasks', 'criticalTasksPage', '1', ajaxDeps);
    expect(missingSubmitSpy).toHaveBeenCalled();
  });

  test('keeps previous content when paginated and sorted updates fail', async () => {
    const form = document.createElement('form');
    form.action = '/outstanding';
    form.method = 'POST';
    form.submit = jest.fn();
    document.body.appendChild(form);

    const paginatedSection = document.createElement('div');
    paginatedSection.dataset.section = 'outstanding-critical-tasks';
    paginatedSection.dataset.ajaxLoaded = 'true';
    paginatedSection.innerHTML = '<p>Existing page</p>';
    document.body.appendChild(paginatedSection);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await fetchPaginatedSection(
      form,
      'outstanding-critical-tasks',
      'criticalTasks',
      'criticalTasksPage',
      '2',
      ajaxDeps
    );

    expect(form.submit).not.toHaveBeenCalled();
    expect(paginatedSection.textContent).toContain('Existing page');
    expect(paginatedSection.textContent).toContain('Retry section');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>paginated-recovered</div>',
    });
    paginatedSection.querySelector<HTMLButtonElement>('button')?.click();
    await flushPromises();
    expect(paginatedSection.innerHTML).toContain('paginated-recovered');

    const sortedSection = document.createElement('div');
    sortedSection.dataset.section = 'user-overview-assigned';
    sortedSection.dataset.ajaxLoaded = 'true';
    sortedSection.innerHTML = '<span>sorted-existing</span>';
    document.body.appendChild(sortedSection);

    await fetchSortedSection(form, 'assigned', 'user-overview-assigned', ajaxDeps);
    expect(form.submit).not.toHaveBeenCalled();
    expect(sortedSection.textContent).toContain('sorted-existing');
    expect(sortedSection.textContent).toContain('Retry section');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>sorted-recovered</div>',
    });
    sortedSection.querySelector<HTMLButtonElement>('button')?.click();
    await flushPromises();
    expect(sortedSection.innerHTML).toContain('sorted-recovered');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('defaults postAjaxForm to the current path and POST', async () => {
    const form = document.createElement('form');
    Object.defineProperty(form, 'action', { value: '', writable: true });
    Object.defineProperty(form, 'method', { value: '', writable: true });
    document.body.appendChild(form);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<span>ok</span>',
    }) as unknown as typeof fetch;

    const result = await postAjaxForm(form, {});

    expect(global.fetch).toHaveBeenCalledWith(window.location.pathname, expect.objectContaining({ method: 'POST' }));
    expect(result).toEqual({ kind: 'html', html: '<span>ok</span>' });
  });

  test('postAjaxForm returns a navigation result for redirects and forbidden responses', async () => {
    const form = document.createElement('form');
    form.action = '/completed';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      redirected: true,
      status: 200,
      url: 'http://localhost/login',
    }) as unknown as typeof fetch;

    await expect(postAjaxForm(form, {})).resolves.toEqual({
      kind: 'navigate',
      url: 'http://localhost/login',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      redirected: false,
      status: 403,
      url: 'http://localhost/completed',
    }) as unknown as typeof fetch;

    await expect(postAjaxForm(form, {})).resolves.toEqual({
      kind: 'navigate',
      url: 'http://localhost/completed',
    });

    Object.defineProperty(form, 'action', { value: '', writable: true });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      redirected: true,
      status: 200,
      url: '',
    }) as unknown as typeof fetch;

    await expect(postAjaxForm(form, {})).resolves.toEqual({
      kind: 'navigate',
      url: window.location.pathname,
    });
  });

  test('navigates away for redirected ajax responses and aborts tracked requests', async () => {
    const form = document.createElement('form');
    form.action = '/completed';
    form.method = 'POST';
    document.body.appendChild(form);

    const section = document.createElement('div');
    section.dataset.section = 'summary';
    document.body.appendChild(section);

    const locationAssignSpy = jest.spyOn(browserLocation, 'locationAssign').mockImplementation(() => {});
    const abortAllSpy = jest.spyOn(ajaxDeps.requests, 'abortAll');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      redirected: true,
      status: 200,
      url: 'http://localhost/login',
    }) as unknown as typeof fetch;

    await fetchSectionUpdate(form, 'summary', ajaxDeps);

    expect(abortAllSpy).toHaveBeenCalled();
    expect(locationAssignSpy).toHaveBeenCalledWith('http://localhost/login');

    locationAssignSpy.mockRestore();
    abortAllSpy.mockRestore();
  });

  test('handles missing sections but does not full submit on ordinary failures', async () => {
    const form = document.createElement('form');
    form.submit = jest.fn();
    document.body.appendChild(form);

    await fetchSectionUpdate(form, 'missing-section', ajaxDeps);
    expect(form.submit).toHaveBeenCalled();

    const failingSection = document.createElement('div');
    failingSection.dataset.section = 'user-overview-assigned';
    document.body.appendChild(failingSection);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await fetchSortedSection(form, 'assigned', 'user-overview-assigned', ajaxDeps);
    expect(form.submit).toHaveBeenCalledTimes(1);
    expect(failingSection.textContent).toContain('This section could not be updated. Try again.');

    await fetchSortedSection(form, 'assigned', 'missing', ajaxDeps);
    expect(form.submit).toHaveBeenCalledTimes(2);

    form.action = '/users';
    form.method = 'POST';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<span>sorted-default</span>',
    }) as unknown as typeof fetch;

    await fetchSortedSection(form, 'assigned', undefined, ajaxDeps);
    expect(failingSection.innerHTML).toContain('sorted-default');
    errorSpy.mockRestore();
  });

  test('initialises ajax section filters and guards missing ids', async () => {
    const ajaxForm = document.createElement('form');
    ajaxForm.dataset.ajaxSection = 'completed-summary';
    ajaxForm.action = '/completed';
    document.body.appendChild(ajaxForm);
    const ajaxSection = document.createElement('div');
    ajaxSection.dataset.section = 'completed-summary';
    document.body.appendChild(ajaxSection);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<p>Updated</p>',
    }) as unknown as typeof fetch;

    initAjaxFilterSections(fetchSectionUpdateWithDeps);
    ajaxForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(ajaxSection.innerHTML).toContain('Updated');
    expect(initAll).toHaveBeenCalled();

    const emptySectionForm = document.createElement('form');
    emptySectionForm.dataset.ajaxSection = '';
    emptySectionForm.submit = jest.fn();
    document.body.appendChild(emptySectionForm);
    initAjaxFilterSections(fetchSectionUpdateWithDeps);
    emptySectionForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(emptySectionForm.submit).toHaveBeenCalled();
  });

  test('initialises ajax initial sections from the filters form', async () => {
    const filtersForm = document.createElement('form');
    filtersForm.dataset.analyticsFilters = 'true';
    document.body.appendChild(filtersForm);

    const initialSection = document.createElement('div');
    initialSection.dataset.section = 'open-tasks-summary';
    initialSection.dataset.ajaxInitial = 'true';
    document.body.appendChild(initialSection);

    const fetchSectionUpdateSpy = jest.fn(async (_form: HTMLFormElement, sectionId: string) => {
      const target = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
      if (target) {
        target.innerHTML = '<p>Updated</p>';
      }
    });

    initAjaxInitialSections(fetchSectionUpdateSpy);
    await flushPromises();

    expect(fetchSectionUpdateSpy).toHaveBeenCalledWith(filtersForm, 'open-tasks-summary');
    expect(initialSection.innerHTML).toContain('Updated');
  });

  test('limits initial ajax section refreshes to two concurrent requests', async () => {
    const filtersForm = document.createElement('form');
    filtersForm.dataset.analyticsFilters = 'true';
    document.body.appendChild(filtersForm);

    ['one', 'two', 'three', 'four'].forEach(sectionId => {
      const section = document.createElement('div');
      section.dataset.section = sectionId;
      section.dataset.ajaxInitial = 'true';
      document.body.appendChild(section);
    });

    let inFlight = 0;
    let maxInFlight = 0;
    const resolvers: (() => void)[] = [];
    const fetchSectionUpdateSpy = jest.fn((_form: HTMLFormElement, _sectionId: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      return new Promise<void>(resolve => {
        resolvers.push(() => {
          inFlight -= 1;
          resolve();
        });
      });
    });

    initAjaxInitialSections(fetchSectionUpdateSpy);
    await flushPromises();
    expect(fetchSectionUpdateSpy).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(2);

    resolvers.shift()?.();
    await flushPromises();
    expect(fetchSectionUpdateSpy).toHaveBeenCalledTimes(3);

    resolvers.shift()?.();
    await flushPromises();
    expect(fetchSectionUpdateSpy).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBe(2);

    while (resolvers.length > 0) {
      resolvers.shift()?.();
    }
    await flushPromises();
  });

  test('fetchSharedFiltersUpdate updates shared filter section and resets pagination fields', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.action = '/';
    form.method = 'POST';
    ['criticalTasksPage', 'assignedPage', 'completedPage'].forEach(name => {
      const input = document.createElement('input');
      input.name = name;
      input.value = '4';
      form.appendChild(input);
    });
    document.body.appendChild(form);

    const sharedFiltersSection = document.createElement('div');
    sharedFiltersSection.dataset.section = 'shared-filters';
    document.body.appendChild(sharedFiltersSection);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>Shared filters updated</div>',
    }) as unknown as typeof fetch;

    await fetchSharedFiltersUpdate(form, 'service', ajaxDeps);

    expect(sharedFiltersSection.innerHTML).toContain('Shared filters updated');
    expect(initAll).toHaveBeenCalledWith({ scope: sharedFiltersSection });
    expect(initMojAll).toHaveBeenCalledWith({ scope: sharedFiltersSection });
    expect(ajaxDeps.rebindSectionBehaviors).toHaveBeenCalled();
    expect(form.querySelector<HTMLInputElement>('input[name="criticalTasksPage"]')?.value).toBe('1');
    expect(form.querySelector<HTMLInputElement>('input[name="assignedPage"]')?.value).toBe('1');
    expect(form.querySelector<HTMLInputElement>('input[name="completedPage"]')?.value).toBe('1');
  });

  test('fetchSharedFiltersUpdate skips duplicate fingerprints and no-ops when section is missing', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.action = '/';
    document.body.appendChild(form);

    const sharedFiltersSection = document.createElement('div');
    sharedFiltersSection.dataset.section = 'shared-filters';
    document.body.appendChild(sharedFiltersSection);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>Shared filters updated</div>',
    }) as unknown as typeof fetch;

    await fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    await fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    sharedFiltersSection.remove();
    await fetchSharedFiltersUpdate(form, 'region', ajaxDeps);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('fetchSharedFiltersUpdate handles abort and non-abort failures', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.action = '/';
    document.body.appendChild(form);

    const sharedFiltersSection = document.createElement('div');
    sharedFiltersSection.dataset.section = 'shared-filters';
    sharedFiltersSection.innerHTML = '<form><p>Filters</p></form>';
    document.body.appendChild(sharedFiltersSection);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    global.fetch = jest.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')) as unknown as typeof fetch;
    await fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    expect(errorSpy).not.toHaveBeenCalled();

    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;
    await fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    expect(errorSpy).toHaveBeenCalledWith('Failed to update shared filters', expect.any(Error));
    expect(sharedFiltersSection.textContent).toContain('Filters');
    expect(sharedFiltersSection.textContent).toContain('Retry section');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>Shared filters recovered</div>',
    });
    sharedFiltersSection.querySelector<HTMLButtonElement>('button')?.click();
    await flushPromises();
    expect(sharedFiltersSection.innerHTML).toContain('Shared filters recovered');

    errorSpy.mockRestore();
  });

  test('shared filters and ordinary sections ignore stale responses from earlier requests', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.action = '/';
    form.method = 'POST';
    document.body.appendChild(form);

    const sharedFiltersSection = document.createElement('div');
    sharedFiltersSection.dataset.section = 'shared-filters';
    document.body.appendChild(sharedFiltersSection);

    let resolveFirstShared:
      | ((response: { ok: boolean; redirected: boolean; status: number; text: () => Promise<string> }) => void)
      | undefined;
    let resolveSecondShared:
      | ((response: { ok: boolean; redirected: boolean; status: number; text: () => Promise<string> }) => void)
      | undefined;
    let callIndex = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callIndex += 1;
      return new Promise(resolve => {
        if (callIndex === 1) {
          resolveFirstShared = resolve;
        } else {
          resolveSecondShared = resolve;
        }
      });
    }) as unknown as typeof fetch;

    const firstSharedCall = fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    await Promise.resolve();
    const secondSharedCall = fetchSharedFiltersUpdate(form, 'region', ajaxDeps);

    resolveFirstShared?.({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>stale-response</div>',
    });
    resolveSecondShared?.({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>latest-response</div>',
    });

    await Promise.all([firstSharedCall, secondSharedCall]);
    expect(sharedFiltersSection.innerHTML).toContain('latest-response');
    expect(sharedFiltersSection.innerHTML).not.toContain('stale-response');

    const section = document.createElement('div');
    section.dataset.section = 'summary';
    document.body.appendChild(section);

    let resolveFirstSection:
      | ((response: { ok: boolean; redirected: boolean; status: number; text: () => Promise<string> }) => void)
      | undefined;
    let resolveSecondSection:
      | ((response: { ok: boolean; redirected: boolean; status: number; text: () => Promise<string> }) => void)
      | undefined;
    let sectionCallIndex = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      sectionCallIndex += 1;
      return new Promise(resolve => {
        if (sectionCallIndex === 1) {
          resolveFirstSection = resolve;
        } else {
          resolveSecondSection = resolve;
        }
      });
    }) as unknown as typeof fetch;

    const firstSectionCall = fetchSectionUpdate(form, 'summary', ajaxDeps);
    await Promise.resolve();
    const secondSectionCall = fetchSectionUpdate(form, 'summary', ajaxDeps);

    resolveFirstSection?.({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>stale-section</div>',
    });
    resolveSecondSection?.({
      ok: true,
      redirected: false,
      status: 200,
      text: async () => '<div>latest-section</div>',
    });

    await Promise.all([firstSectionCall, secondSectionCall]);
    expect(section.innerHTML).toContain('latest-section');
    expect(section.innerHTML).not.toContain('stale-section');
  });

  test('initAjaxInitialSections skips already-bound and sectionless entries and no-ops without form', async () => {
    const fetchSectionUpdateSpy = jest.fn(async () => {});

    initAjaxInitialSections(fetchSectionUpdateSpy);
    await flushPromises();
    expect(fetchSectionUpdateSpy).not.toHaveBeenCalled();

    const filtersForm = document.createElement('form');
    filtersForm.dataset.analyticsFilters = 'true';
    document.body.appendChild(filtersForm);

    const alreadyBoundSection = document.createElement('div');
    alreadyBoundSection.dataset.section = 'already-bound';
    alreadyBoundSection.dataset.ajaxInitial = 'true';
    alreadyBoundSection.dataset.ajaxInitialBound = 'true';
    document.body.appendChild(alreadyBoundSection);

    const missingSectionId = document.createElement('div');
    missingSectionId.dataset.ajaxInitial = 'true';
    document.body.appendChild(missingSectionId);

    const validSection = document.createElement('div');
    validSection.dataset.ajaxInitial = 'true';
    validSection.dataset.section = 'valid-initial';
    document.body.appendChild(validSection);

    initAjaxInitialSections(fetchSectionUpdateSpy);
    await flushPromises();
    expect(fetchSectionUpdateSpy).toHaveBeenCalledTimes(1);
    expect(fetchSectionUpdateSpy).toHaveBeenCalledWith(filtersForm, 'valid-initial');
  });
});
