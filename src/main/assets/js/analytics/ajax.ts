import { getAnalyticsFiltersForm, storeScrollPosition } from './forms';

export type InitAll = (options?: { scope?: HTMLElement }) => void;

export type AjaxDeps = {
  initAll: InitAll;
  initMojAll: InitAll;
  rebindSectionBehaviors: () => void;
};

export type FetchSectionUpdate = (form: HTMLFormElement, sectionId: string) => Promise<void>;
export type FetchSortedSection = (form: HTMLFormElement, scope: string, sectionId?: string) => Promise<void>;
export type FetchPaginatedSection = (
  form: HTMLFormElement,
  sectionId: string,
  ajaxSection: string,
  pageParam: string,
  page: string
) => Promise<void>;

const INITIAL_SECTION_CONCURRENCY = 2;
const FILTER_PAGINATION_FIELDS = ['criticalTasksPage', 'assignedPage', 'completedPage'] as const;
const sharedFiltersAbortControllers = new WeakMap<HTMLFormElement, AbortController>();
const sharedFiltersLastAppliedFingerprint = new WeakMap<HTMLFormElement, string>();

async function runBounded<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workerCount = Math.min(Math.max(concurrency, 1), queue.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const item = queue.shift();
        if (item === undefined) {
          break;
        }
        await worker(item);
      }
    })
  );
}

export function buildUrlEncodedBody(form: HTMLFormElement, extra: Record<string, string> = {}): URLSearchParams {
  const formData = new FormData(form);
  const params = new URLSearchParams();
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      params.append(key, value);
      return;
    }
    params.append(key, value.name);
  });
  Object.entries(extra).forEach(([key, value]) => {
    params.set(key, value);
  });
  return params;
}

export async function postAjaxForm(form: HTMLFormElement, extra: Record<string, string>): Promise<string> {
  return postAjaxFormWithOptions(form, extra);
}

async function postAjaxFormWithOptions(
  form: HTMLFormElement,
  extra: Record<string, string>,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const response = await fetch(form.action || window.location.pathname, {
    method: form.method || 'POST',
    headers: {
      'X-Requested-With': 'fetch',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: buildUrlEncodedBody(form, extra).toString(),
    credentials: 'same-origin',
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch section: ${response.status}`);
  }
  return response.text();
}

function resetPaginationFields(form: HTMLFormElement): void {
  FILTER_PAGINATION_FIELDS.forEach(fieldName => {
    const field = form.querySelector<HTMLInputElement>(`input[name="${fieldName}"]`);
    if (field) {
      field.value = '1';
    }
  });
}

export async function fetchSharedFiltersUpdate(
  form: HTMLFormElement,
  changedFilter: string,
  deps: AjaxDeps
): Promise<void> {
  const target = document.querySelector<HTMLElement>('[data-section="shared-filters"]');
  if (!target) {
    return;
  }

  const extra: Record<string, string> = {
    ajaxSection: 'shared-filters',
    changedFilter,
    facetRefresh: '1',
  };
  FILTER_PAGINATION_FIELDS.forEach(fieldName => {
    if (form.querySelector<HTMLInputElement>(`input[name="${fieldName}"]`)) {
      extra[fieldName] = '1';
    }
  });

  const fingerprint = buildUrlEncodedBody(form, extra).toString();
  if (sharedFiltersLastAppliedFingerprint.get(form) === fingerprint) {
    return;
  }

  const existingController = sharedFiltersAbortControllers.get(form);
  if (existingController) {
    existingController.abort();
  }
  const controller = new AbortController();
  sharedFiltersAbortControllers.set(form, controller);

  try {
    const html = await postAjaxFormWithOptions(form, extra, { signal: controller.signal });
    if (controller.signal.aborted) {
      return;
    }
    target.innerHTML = html;
    deps.initAll({ scope: target });
    deps.initMojAll({ scope: target });
    deps.rebindSectionBehaviors();
    const refreshedForm = getAnalyticsFiltersForm();
    if (refreshedForm) {
      resetPaginationFields(refreshedForm);
    }
    sharedFiltersLastAppliedFingerprint.set(form, fingerprint);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Failed to update shared filters', error);
  } finally {
    if (sharedFiltersAbortControllers.get(form) === controller) {
      sharedFiltersAbortControllers.delete(form);
    }
  }
}

export async function fetchSectionUpdate(form: HTMLFormElement, sectionId: string, deps: AjaxDeps): Promise<void> {
  const target = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
  if (!target) {
    form.submit();
    return;
  }
  try {
    const html = await postAjaxForm(form, { ajaxSection: sectionId });
    target.innerHTML = html;
    deps.initAll({ scope: target });
    deps.initMojAll({ scope: target });
    deps.rebindSectionBehaviors();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to update section', error);
    form.submit();
  }
}

export async function fetchSortedSection(
  form: HTMLFormElement,
  scope: string,
  sectionId: string | undefined,
  deps: AjaxDeps
): Promise<void> {
  const resolvedSectionId = sectionId ?? `user-overview-${scope}`;
  const target = document.querySelector<HTMLElement>(`[data-section="${resolvedSectionId}"]`);
  if (!target) {
    storeScrollPosition();
    form.submit();
    return;
  }
  try {
    const html = await postAjaxForm(form, { ajaxSection: scope });
    target.innerHTML = html;
    deps.initMojAll({ scope: target });
    deps.rebindSectionBehaviors();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to update sorted section', error);
    storeScrollPosition();
    form.submit();
  }
}

export async function fetchPaginatedSection(
  form: HTMLFormElement,
  sectionId: string,
  ajaxSection: string,
  pageParam: string,
  page: string,
  deps: AjaxDeps
): Promise<void> {
  const target = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
  if (!target) {
    storeScrollPosition();
    form.submit();
    return;
  }
  try {
    const html = await postAjaxForm(form, { ajaxSection, [pageParam]: page });
    target.innerHTML = html;
    deps.initAll({ scope: target });
    deps.initMojAll({ scope: target });
    deps.rebindSectionBehaviors();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to update paginated section', error);
    storeScrollPosition();
    form.submit();
  }
}

export function initAjaxFilterSections(fetchSectionUpdateWithDeps: FetchSectionUpdate): void {
  const forms = document.querySelectorAll<HTMLFormElement>('form[data-ajax-section]');
  forms.forEach(form => {
    if (form.dataset.ajaxBound === 'true') {
      return;
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const sectionId = form.dataset.ajaxSection;
      if (!sectionId) {
        form.submit();
        return;
      }
      void fetchSectionUpdateWithDeps(form, sectionId);
    });
    form.dataset.ajaxBound = 'true';
  });
}

export function initAjaxInitialSections(fetchSectionUpdateWithDeps: FetchSectionUpdate): void {
  const form = getAnalyticsFiltersForm();
  if (!form) {
    return;
  }
  const sections = document.querySelectorAll<HTMLElement>('[data-ajax-initial="true"]');
  const sectionIds: string[] = [];
  sections.forEach(section => {
    if (section.dataset.ajaxInitialBound === 'true') {
      return;
    }
    const sectionId = section.dataset.section;
    if (!sectionId) {
      return;
    }
    section.dataset.ajaxInitialBound = 'true';
    sectionIds.push(sectionId);
  });
  void runBounded(sectionIds, INITIAL_SECTION_CONCURRENCY, sectionId => fetchSectionUpdateWithDeps(form, sectionId));
}
