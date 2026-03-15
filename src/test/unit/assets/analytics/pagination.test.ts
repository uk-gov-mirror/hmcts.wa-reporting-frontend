/* @jest-environment jsdom */
import { initAll as initMojAll } from '@ministryofjustice/frontend';
import { initAll } from 'govuk-frontend';

import type { AjaxDeps } from '../../../../main/assets/js/analytics/ajax';
import { fetchPaginatedSection } from '../../../../main/assets/js/analytics/ajax';
import { createSectionRequestManager } from '../../../../main/assets/js/analytics/requestManager';
import {
  getPaginationParamFromHref,
  initCriticalTasksPagination,
  initUserOverviewPagination,
} from '../../../../main/assets/js/analytics/pagination';

import { setupAnalyticsDom } from './analyticsTestUtils';

jest.mock('govuk-frontend', () => ({ initAll: jest.fn() }));
jest.mock('@ministryofjustice/frontend', () => ({ initAll: jest.fn() }));

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('analytics pagination', () => {
  let ajaxDeps: AjaxDeps;
  const fetchPaginatedSectionWithDeps = (
    form: HTMLFormElement,
    sectionId: string,
    ajaxSection: string,
    pageParam: string,
    page: string
  ): Promise<void> => fetchPaginatedSection(form, sectionId, ajaxSection, pageParam, page, ajaxDeps);

  beforeEach(() => {
    setupAnalyticsDom();
    ajaxDeps = {
      initAll,
      initMojAll,
      rebindSectionBehaviors: jest.fn(),
      requests: createSectionRequestManager(),
    };
  });

  test('initialises pagination controls', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    document.body.appendChild(form);

    const section = document.createElement('div');
    section.dataset.section = 'outstanding-critical-tasks';
    document.body.appendChild(section);

    const pagination = document.createElement('nav');
    pagination.dataset.criticalTasksPagination = 'true';
    pagination.innerHTML = '<a href="/outstanding?criticalTasksPage=2">Page 2</a>';
    document.body.appendChild(pagination);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<div>updated</div>',
    }) as unknown as typeof fetch;

    initCriticalTasksPagination(fetchPaginatedSectionWithDeps);
    pagination.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(form.querySelector<HTMLInputElement>('input[name="criticalTasksPage"]')?.value).toBe('2');
    expect(initAll).toHaveBeenCalledWith({ scope: section });
    expect(initMojAll).toHaveBeenCalledWith({ scope: section });

    const userPagination = document.createElement('nav');
    userPagination.dataset.userOverviewPagination = 'completed';
    userPagination.innerHTML = '<a href="/users?completedPage=3">Page 3</a>';
    document.body.appendChild(userPagination);

    initUserOverviewPagination(fetchPaginatedSectionWithDeps);
    const userSection = document.createElement('div');
    userSection.dataset.section = 'user-overview-completed';
    document.body.appendChild(userSection);
    userPagination.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(form.querySelector<HTMLInputElement>('input[name="completedPage"]')?.value).toBe('3');
    expect(initAll).toHaveBeenCalledWith({ scope: userSection });
    expect(initMojAll).toHaveBeenCalledWith({ scope: userSection });

    expect(getPaginationParamFromHref('/outstanding?criticalTasksPage=2', 'criticalTasksPage')).toBe('2');
    expect(getPaginationParamFromHref('http://[invalid', 'criticalTasksPage')).toBeNull();
  });

  test('guards pagination handlers when inputs are missing', () => {
    const criticalPagination = document.createElement('nav');
    criticalPagination.dataset.criticalTasksPagination = 'true';
    document.body.appendChild(criticalPagination);
    initCriticalTasksPagination(fetchPaginatedSectionWithDeps);
    criticalPagination.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const missingPageLink = document.createElement('nav');
    missingPageLink.dataset.criticalTasksPagination = 'true';
    missingPageLink.innerHTML = '<a href="/outstanding">Page</a>';
    document.body.appendChild(missingPageLink);
    initCriticalTasksPagination(fetchPaginatedSectionWithDeps);
    missingPageLink.querySelector('a')?.addEventListener('click', event => event.preventDefault());
    missingPageLink.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const missingFormPagination = document.createElement('nav');
    missingFormPagination.dataset.criticalTasksPagination = 'true';
    missingFormPagination.innerHTML = '<a href="/outstanding?criticalTasksPage=2">Page</a>';
    document.body.appendChild(missingFormPagination);
    initCriticalTasksPagination(fetchPaginatedSectionWithDeps);
    missingFormPagination.querySelector('a')?.addEventListener('click', event => event.preventDefault());
    missingFormPagination
      .querySelector('a')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const missingScope = document.createElement('nav');
    missingScope.dataset.userOverviewPagination = '';
    document.body.appendChild(missingScope);
    initUserOverviewPagination(fetchPaginatedSectionWithDeps);

    const missingPage = document.createElement('nav');
    missingPage.dataset.userOverviewPagination = 'assigned';
    missingPage.innerHTML = '<a href="/users">Page</a>';
    document.body.appendChild(missingPage);
    initUserOverviewPagination(fetchPaginatedSectionWithDeps);
    missingPage.querySelector('a')?.addEventListener('click', event => event.preventDefault());
    missingPage.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const missingForm = document.createElement('nav');
    missingForm.dataset.userOverviewPagination = 'completed';
    missingForm.innerHTML = '<a href="/users?completedPage=2">Page</a>';
    document.body.appendChild(missingForm);
    initUserOverviewPagination(fetchPaginatedSectionWithDeps);
    missingForm.querySelector('a')?.addEventListener('click', event => event.preventDefault());
    missingForm.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const missingLink = document.createElement('nav');
    missingLink.dataset.userOverviewPagination = 'assigned';
    document.body.appendChild(missingLink);
    initUserOverviewPagination(fetchPaginatedSectionWithDeps);
    missingLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(document.querySelectorAll('nav')).toHaveLength(7);
  });
});
