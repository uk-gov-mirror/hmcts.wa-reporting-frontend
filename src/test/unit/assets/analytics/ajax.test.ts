/* @jest-environment jsdom */
import { initAll as initMojAll } from '@ministryofjustice/frontend';
import { initAll } from 'govuk-frontend';

import type { AjaxDeps } from '../../../../main/assets/js/analytics/ajax';
import {
  buildUrlEncodedBody,
  fetchPaginatedSection,
  fetchSectionUpdate,
  fetchSharedFiltersUpdate,
  fetchSortedSection,
  initAjaxFilterSections,
  initAjaxInitialSections,
  postAjaxForm,
} from '../../../../main/assets/js/analytics/ajax';

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
    };
  });

  test('falls back to full submit when ajax requests fail', async () => {
    const form = document.createElement('form');
    form.dataset.ajaxSection = 'summary';
    form.action = '/';
    const submitSpy = jest.spyOn(form, 'submit').mockImplementation(() => {});
    document.body.appendChild(form);
    const section = document.createElement('div');
    section.dataset.section = 'summary';
    document.body.appendChild(section);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await fetchSectionUpdate(form, 'summary', ajaxDeps);

    expect(submitSpy).toHaveBeenCalled();
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
    global.FormData = originalFormData;
    expect(params.get('search')).toBe('alpha');
    expect(params.get('upload')).toBe('file.txt');
    expect(params.get('extra')).toBe('value');

    const section = document.createElement('div');
    section.dataset.section = 'outstanding-critical-tasks';
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

  test('falls back when paginated updates fail', async () => {
    const form = document.createElement('form');
    form.action = '/outstanding';
    form.method = 'POST';
    form.submit = jest.fn();
    document.body.appendChild(form);

    const section = document.createElement('div');
    section.dataset.section = 'outstanding-critical-tasks';
    document.body.appendChild(section);

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

    expect(form.submit).toHaveBeenCalled();
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
      text: async () => '<span>ok</span>',
    }) as unknown as typeof fetch;

    await postAjaxForm(form, {});

    expect(global.fetch).toHaveBeenCalledWith(window.location.pathname, expect.objectContaining({ method: 'POST' }));
  });

  test('handles missing sections and failed pagination updates', async () => {
    const form = document.createElement('form');
    form.submit = jest.fn();
    document.body.appendChild(form);

    await fetchSectionUpdate(form, 'missing-section', ajaxDeps);
    expect(form.submit).toHaveBeenCalled();

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sortedSection = document.createElement('div');
    sortedSection.dataset.section = 'user-overview-assigned';
    document.body.appendChild(sortedSection);

    await fetchSortedSection(form, 'assigned', 'user-overview-assigned', ajaxDeps);
    expect(form.submit).toHaveBeenCalled();

    await fetchSortedSection(form, 'assigned', 'missing', ajaxDeps);
    expect(form.submit).toHaveBeenCalled();

    form.action = '/users';
    form.method = 'POST';

    const defaultSection = sortedSection;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<span>sorted</span>',
    }) as unknown as typeof fetch;

    await fetchSortedSection(form, 'assigned', undefined, ajaxDeps);
    expect(defaultSection.innerHTML).toContain('sorted');

    const paginatedSection = document.createElement('div');
    paginatedSection.dataset.section = 'outstanding-critical-tasks';
    document.body.appendChild(paginatedSection);
    await fetchPaginatedSection(
      form,
      'outstanding-critical-tasks',
      'criticalTasks',
      'criticalTasksPage',
      '2',
      ajaxDeps
    );
    expect(form.submit).toHaveBeenCalled();
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
    document.body.appendChild(sharedFiltersSection);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    global.fetch = jest.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')) as unknown as typeof fetch;
    await fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    expect(errorSpy).not.toHaveBeenCalled();

    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;
    await fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    expect(errorSpy).toHaveBeenCalledWith('Failed to update shared filters', expect.any(Error));

    errorSpy.mockRestore();
  });

  test('fetchSharedFiltersUpdate ignores stale aborted responses from earlier requests', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.action = '/';
    form.method = 'POST';
    document.body.appendChild(form);

    const sharedFiltersSection = document.createElement('div');
    sharedFiltersSection.dataset.section = 'shared-filters';
    document.body.appendChild(sharedFiltersSection);

    let resolveFirst: ((response: { ok: boolean; text: () => Promise<string> }) => void) | undefined;
    let resolveSecond: ((response: { ok: boolean; text: () => Promise<string> }) => void) | undefined;
    let callIndex = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callIndex += 1;
      return new Promise(resolve => {
        if (callIndex === 1) {
          resolveFirst = resolve;
        } else {
          resolveSecond = resolve;
        }
      });
    }) as unknown as typeof fetch;

    const firstCall = fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    await Promise.resolve();
    const secondCall = fetchSharedFiltersUpdate(form, 'region', ajaxDeps);

    resolveFirst?.({
      ok: true,
      text: async () => '<div>stale-response</div>',
    });
    resolveSecond?.({
      ok: true,
      text: async () => '<div>latest-response</div>',
    });

    await Promise.all([firstCall, secondCall]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sharedFiltersSection.innerHTML).toContain('latest-response');
    expect(sharedFiltersSection.innerHTML).not.toContain('stale-response');
  });

  test('fetchSharedFiltersUpdate skips pagination reset when no analytics filter form exists', async () => {
    const form = document.createElement('form');
    form.action = '/';
    form.method = 'POST';
    document.body.appendChild(form);

    const sharedFiltersSection = document.createElement('div');
    sharedFiltersSection.dataset.section = 'shared-filters';
    document.body.appendChild(sharedFiltersSection);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<div>Shared filters updated</div>',
    }) as unknown as typeof fetch;

    await fetchSharedFiltersUpdate(form, 'service', ajaxDeps);
    expect(sharedFiltersSection.innerHTML).toContain('Shared filters updated');
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
