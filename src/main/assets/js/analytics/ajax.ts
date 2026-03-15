import { getAnalyticsFiltersForm, storeScrollPosition } from './forms';
import type { SectionRequestManager } from './requestManager';

export type InitAll = (options?: { scope?: HTMLElement }) => void;

export type AjaxDeps = {
  initAll: InitAll;
  initMojAll: InitAll;
  rebindSectionBehaviors: () => void;
  requests: SectionRequestManager;
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

export type AjaxRequestResult = { kind: 'html'; html: string } | { kind: 'navigate'; url: string };

export const browserLocation = {
  locationAssign(url: string): void {
    /* istanbul ignore next -- jsdom exposes location.assign as a read-only navigation primitive */
    window.location.assign(url);
  },
  assign(url: string): void {
    browserLocation.locationAssign(url);
  },
};

const INITIAL_SECTION_CONCURRENCY = 2;
const FILTER_PAGINATION_FIELDS = ['criticalTasksPage', 'assignedPage', 'completedPage'] as const;
const SECTION_ERROR_SELECTOR = '[data-section-request-error="true"]';
const SECTION_ERROR_MESSAGE = 'This section could not be updated. Try again.';
const SECTION_RETRY_LABEL = 'Retry section';
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

export async function postAjaxForm(
  form: HTMLFormElement,
  extra: Record<string, string>,
  options?: { signal?: AbortSignal }
): Promise<AjaxRequestResult> {
  return postAjaxFormWithOptions(form, extra, options);
}

async function postAjaxFormWithOptions(
  form: HTMLFormElement,
  extra: Record<string, string>,
  options?: { signal?: AbortSignal }
): Promise<AjaxRequestResult> {
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

  if (response.redirected || response.status === 401 || response.status === 403) {
    return {
      kind: 'navigate',
      url: response.url || form.action || window.location.pathname,
    };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch section: ${response.status}`);
  }

  return {
    kind: 'html',
    html: await response.text(),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function navigateToUrl(url: string): void {
  browserLocation.assign(url);
}

function resetPaginationFields(form: HTMLFormElement): void {
  FILTER_PAGINATION_FIELDS.forEach(fieldName => {
    const field = form.querySelector<HTMLInputElement>(`input[name="${fieldName}"]`);
    if (field) {
      field.value = '1';
    }
  });
}

function clearSectionError(target: HTMLElement): void {
  target.querySelectorAll<HTMLElement>(SECTION_ERROR_SELECTOR).forEach(node => node.remove());
}

function setSectionBusy(target: HTMLElement, busy: boolean): void {
  target.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function markSectionLoaded(target: HTMLElement): void {
  target.dataset.ajaxLoaded = 'true';
}

function createSectionErrorElement(retry: () => Promise<void>): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.dataset.sectionRequestError = 'true';
  wrapper.className = 'govuk-warning-text govuk-!-margin-bottom-4';
  wrapper.setAttribute('role', 'alert');

  const icon = document.createElement('span');
  icon.className = 'govuk-warning-text__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '!';

  const text = document.createElement('strong');
  text.className = 'govuk-warning-text__text';

  const hiddenText = document.createElement('span');
  hiddenText.className = 'govuk-visually-hidden';
  hiddenText.textContent = 'Warning';

  text.append(hiddenText, document.createTextNode(` ${SECTION_ERROR_MESSAGE}`));

  const action = document.createElement('div');
  action.className = 'govuk-!-margin-top-3';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'govuk-button govuk-button--secondary govuk-!-margin-bottom-0';
  button.textContent = SECTION_RETRY_LABEL;
  button.addEventListener('click', () => {
    if (button.disabled) {
      return;
    }
    button.disabled = true;
    void retry().finally(() => {
      button.disabled = false;
    });
  });

  action.appendChild(button);
  wrapper.append(icon, text, action);
  return wrapper;
}

function renderSectionError(
  target: HTMLElement,
  retry: () => Promise<void>,
  options?: { preserveExistingContent?: boolean }
): void {
  clearSectionError(target);
  const error = createSectionErrorElement(retry);

  if (target.dataset.ajaxLoaded === 'true' || options?.preserveExistingContent) {
    target.prepend(error);
    return;
  }

  target.replaceChildren(error);
}

type ManagedSectionRequestParams = {
  requestKey: string;
  target: HTMLElement;
  deps: AjaxDeps;
  request: (signal: AbortSignal) => Promise<AjaxRequestResult>;
  applyHtml: (html: string) => void;
  retry: () => Promise<void>;
  errorLog: string;
  preserveExistingContentOnFailure?: boolean;
};

async function runManagedSectionRequest({
  requestKey,
  target,
  deps,
  request,
  applyHtml,
  retry,
  errorLog,
  preserveExistingContentOnFailure = false,
}: ManagedSectionRequestParams): Promise<void> {
  const handle = deps.requests.start(requestKey);
  setSectionBusy(target, true);

  try {
    const result = await request(handle.signal);
    if (!handle.isCurrent() || !target.isConnected) {
      return;
    }

    if (result.kind === 'navigate') {
      deps.requests.abortAll();
      navigateToUrl(result.url);
      return;
    }

    clearSectionError(target);
    applyHtml(result.html);
    markSectionLoaded(target);
  } catch (error) {
    if (isAbortError(error) || !handle.isCurrent() || !target.isConnected) {
      return;
    }
    // eslint-disable-next-line no-console
    console.error(errorLog, error);
    renderSectionError(target, retry, { preserveExistingContent: preserveExistingContentOnFailure });
  } finally {
    const isCurrent = handle.isCurrent();
    handle.finish();
    if (isCurrent && target.isConnected) {
      setSectionBusy(target, false);
    }
  }
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

  await runManagedSectionRequest({
    requestKey: 'shared-filters',
    target,
    deps,
    request: signal => postAjaxForm(form, extra, { signal }),
    applyHtml: html => {
      target.innerHTML = html;
      deps.initAll({ scope: target });
      deps.initMojAll({ scope: target });
      deps.rebindSectionBehaviors();
      const refreshedForm = getAnalyticsFiltersForm();
      if (refreshedForm) {
        resetPaginationFields(refreshedForm);
      }
      sharedFiltersLastAppliedFingerprint.set(form, fingerprint);
    },
    retry: () => fetchSharedFiltersUpdate(form, changedFilter, deps),
    errorLog: 'Failed to update shared filters',
    preserveExistingContentOnFailure: true,
  });
}

export async function fetchSectionUpdate(form: HTMLFormElement, sectionId: string, deps: AjaxDeps): Promise<void> {
  const target = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
  if (!target) {
    form.submit();
    return;
  }

  await runManagedSectionRequest({
    requestKey: sectionId,
    target,
    deps,
    request: signal => postAjaxForm(form, { ajaxSection: sectionId }, { signal }),
    applyHtml: html => {
      target.innerHTML = html;
      deps.initAll({ scope: target });
      deps.initMojAll({ scope: target });
      deps.rebindSectionBehaviors();
    },
    retry: () => fetchSectionUpdate(form, sectionId, deps),
    errorLog: 'Failed to update section',
  });
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

  await runManagedSectionRequest({
    requestKey: resolvedSectionId,
    target,
    deps,
    request: signal => postAjaxForm(form, { ajaxSection: scope }, { signal }),
    applyHtml: html => {
      target.innerHTML = html;
      deps.initMojAll({ scope: target });
      deps.rebindSectionBehaviors();
    },
    retry: () => fetchSortedSection(form, scope, sectionId, deps),
    errorLog: 'Failed to update sorted section',
    preserveExistingContentOnFailure: true,
  });
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

  await runManagedSectionRequest({
    requestKey: sectionId,
    target,
    deps,
    request: signal => postAjaxForm(form, { ajaxSection, [pageParam]: page }, { signal }),
    applyHtml: html => {
      target.innerHTML = html;
      deps.initAll({ scope: target });
      deps.initMojAll({ scope: target });
      deps.rebindSectionBehaviors();
    },
    retry: () => fetchPaginatedSection(form, sectionId, ajaxSection, pageParam, page, deps),
    errorLog: 'Failed to update paginated section',
    preserveExistingContentOnFailure: true,
  });
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
