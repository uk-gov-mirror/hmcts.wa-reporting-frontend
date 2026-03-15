/* @jest-environment jsdom */
import { initAll as initMojAll } from '@ministryofjustice/frontend';
import { initAll } from 'govuk-frontend';

import type { AjaxDeps } from '../../../../main/assets/js/analytics/ajax';
import { fetchSortedSection } from '../../../../main/assets/js/analytics/ajax';
import { createSectionRequestManager } from '../../../../main/assets/js/analytics/requestManager';
import {
  initMojServerSorting,
  initMojTotalsRowPinning,
  initTableExports,
  moveTotalsRowToEnd,
  tableToCsv,
} from '../../../../main/assets/js/analytics/tables';

import { setupAnalyticsDom } from './analyticsTestUtils';

jest.mock('govuk-frontend', () => ({ initAll: jest.fn() }));
jest.mock('@ministryofjustice/frontend', () => ({ initAll: jest.fn() }));

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('analytics tables', () => {
  let ajaxDeps: AjaxDeps;
  const fetchSortedSectionWithDeps = (form: HTMLFormElement, scope: string, sectionId?: string): Promise<void> =>
    fetchSortedSection(form, scope, sectionId, ajaxDeps);

  beforeEach(() => {
    setupAnalyticsDom();
    ajaxDeps = {
      initAll,
      initMojAll,
      rebindSectionBehaviors: jest.fn(),
      requests: createSectionRequestManager(),
    };
  });

  test('exports tables to CSV', () => {
    const exportButton = document.createElement('button');
    exportButton.dataset.exportCsvButton = 'true';
    const table = document.createElement('table');
    table.dataset.exportCsv = 'true';
    const head = document.createElement('thead');
    head.innerHTML = '<tr><th>Name</th><th>Count</th></tr>';
    const body = document.createElement('tbody');
    body.innerHTML = `
      <tr><td data-export-value="2024-01-02">2 Jan 2024</td><td>2</td></tr>
      <tr><td>Total</td><td>5</td></tr>
      <tr><td>Alpha</td><td>3</td></tr>
    `;
    table.appendChild(head);
    table.appendChild(body);
    document.body.appendChild(exportButton);
    document.body.appendChild(table);

    initTableExports();
    exportButton.click();
    initTableExports();
    expect(URL.createObjectURL).toHaveBeenCalled();

    const csv = tableToCsv(table);
    expect(csv.split('\n')[1]).toContain('2024-01-02');

    const orphanContainer = document.createElement('div');
    const orphanButton = document.createElement('button');
    orphanButton.dataset.exportCsvButton = 'true';
    orphanContainer.appendChild(orphanButton);
    document.body.appendChild(orphanContainer);
    initTableExports();
    expect(orphanButton.dataset.exportBound).toBeUndefined();
  });

  test('handles moj server sorting for tables', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.action = '/completed';
    document.body.appendChild(form);

    const mojTable = document.createElement('table');
    mojTable.dataset.module = 'moj-sortable-table';
    mojTable.dataset.serverSort = 'true';
    mojTable.dataset.sortScope = 'completed';
    mojTable.dataset.sortSection = 'user-overview-completed';
    mojTable.innerHTML = `
      <thead>
        <tr>
          <th data-sort-key="name"><button type="button">Name</button></th>
        </tr>
      </thead>
      <tbody><tr><td>Item</td></tr></tbody>
    `;
    document.body.appendChild(mojTable);

    const criticalMojTable = document.createElement('table');
    criticalMojTable.dataset.module = 'moj-sortable-table';
    criticalMojTable.dataset.serverSort = 'true';
    criticalMojTable.dataset.sortScope = 'criticalTasks';
    criticalMojTable.dataset.sortSection = 'critical-tasks-section';
    criticalMojTable.innerHTML = `
      <thead>
        <tr>
          <th data-sort-key="task" data-sort-default-dir="desc"><button type="button">Task</button></th>
        </tr>
      </thead>
      <tbody><tr><td>Item</td></tr></tbody>
    `;
    document.body.appendChild(criticalMojTable);

    const assignedMojTable = document.createElement('table');
    assignedMojTable.dataset.module = 'moj-sortable-table';
    assignedMojTable.dataset.serverSort = 'true';
    assignedMojTable.dataset.sortScope = 'assigned';
    assignedMojTable.dataset.sortSection = 'assigned-section';
    assignedMojTable.innerHTML = `
      <thead>
        <tr>
          <th data-sort-key="name"><button type="button">Name</button></th>
        </tr>
      </thead>
      <tbody><tr><td>Item</td></tr></tbody>
    `;
    document.body.appendChild(assignedMojTable);
    initMojServerSorting(fetchSortedSectionWithDeps);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<p>Updated</p>',
    }) as unknown as typeof fetch;
    const mojButton = mojTable.querySelector('button');
    const mojSection = document.createElement('div');
    mojSection.dataset.section = 'user-overview-completed';
    document.body.appendChild(mojSection);
    const criticalSection = document.createElement('div');
    criticalSection.dataset.section = 'critical-tasks-section';
    document.body.appendChild(criticalSection);
    const assignedSection = document.createElement('div');
    assignedSection.dataset.section = 'assigned-section';
    document.body.appendChild(assignedSection);

    const criticalButton = criticalMojTable.querySelector('button');
    const assignedButton = assignedMojTable.querySelector('button');
    mojButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    criticalButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assignedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(form.querySelector<HTMLInputElement>('input[name="completedSortBy"]')?.value).toBe('name');
    expect(form.querySelector<HTMLInputElement>('input[name="completedSortDir"]')?.value).toBe('asc');
    expect(form.querySelector<HTMLInputElement>('input[name="criticalTasksSortBy"]')?.value).toBe('task');
    expect(form.querySelector<HTMLInputElement>('input[name="criticalTasksSortDir"]')?.value).toBe('desc');
    expect(form.querySelector<HTMLInputElement>('input[name="criticalTasksPage"]')?.value).toBe('1');
    expect(form.querySelector<HTMLInputElement>('input[name="assignedPage"]')?.value).toBe('1');
  });

  test('covers csv fallbacks', () => {
    const exportButton = document.createElement('button');
    exportButton.dataset.exportCsvButton = 'true';
    const exportTable = document.createElement('table');
    const exportRow = document.createElement('tr');
    const exportCell = document.createElement('td');
    Object.defineProperty(exportCell, 'textContent', { value: null });
    exportRow.appendChild(exportCell);
    exportTable.appendChild(exportRow);
    const exportContainer = document.createElement('div');
    exportContainer.appendChild(exportButton);
    exportContainer.appendChild(exportTable);
    document.body.appendChild(exportContainer);

    initTableExports();
    exportButton.click();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  test('handles moj server sort when aria-sort is ascending', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    document.body.appendChild(form);

    const section = document.createElement('div');
    section.dataset.section = 'completed-section';
    document.body.appendChild(section);

    const mojTable = document.createElement('table');
    mojTable.dataset.module = 'moj-sortable-table';
    mojTable.dataset.serverSort = 'true';
    mojTable.dataset.sortScope = 'completed';
    mojTable.dataset.sortSection = 'completed-section';
    mojTable.innerHTML = `
      <thead>
        <tr>
          <th data-sort-key="name" aria-sort="ascending"><button type="button">Name</button></th>
        </tr>
      </thead>
      <tbody><tr><td>Item</td></tr></tbody>
    `;
    document.body.appendChild(mojTable);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<p>Updated</p>',
    }) as unknown as typeof fetch;

    initMojServerSorting(fetchSortedSectionWithDeps);
    mojTable.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(form.querySelector<HTMLInputElement>('input[name="completedSortDir"]')?.value).toBe('desc');
  });

  test('covers sorting guard clauses', async () => {
    const form = document.createElement('form');
    form.dataset.analyticsFilters = 'true';
    form.submit = jest.fn();
    document.body.appendChild(form);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<div>ok</div>',
    }) as unknown as typeof fetch;

    const mojMissingHead = document.createElement('table');
    mojMissingHead.dataset.module = 'moj-sortable-table';
    mojMissingHead.dataset.serverSort = 'true';
    mojMissingHead.dataset.sortScope = 'assigned';
    document.body.appendChild(mojMissingHead);

    const mojNoButton = document.createElement('table');
    mojNoButton.dataset.module = 'moj-sortable-table';
    mojNoButton.dataset.serverSort = 'true';
    mojNoButton.dataset.sortScope = 'assigned';
    mojNoButton.innerHTML = '<thead><tr><th data-sort-key="task">Task</th></tr></thead><tbody></tbody>';
    document.body.appendChild(mojNoButton);

    const mojNoHeading = document.createElement('table');
    mojNoHeading.dataset.module = 'moj-sortable-table';
    mojNoHeading.dataset.serverSort = 'true';
    mojNoHeading.dataset.sortScope = 'assigned';
    mojNoHeading.innerHTML = '<thead><tr><td><button type="button">Task</button></td></tr></thead><tbody></tbody>';
    document.body.appendChild(mojNoHeading);

    const mojNoSortKey = document.createElement('table');
    mojNoSortKey.dataset.module = 'moj-sortable-table';
    mojNoSortKey.dataset.serverSort = 'true';
    mojNoSortKey.dataset.sortScope = 'assigned';
    mojNoSortKey.innerHTML = '<thead><tr><th><button type="button">Task</button></th></tr></thead><tbody></tbody>';
    document.body.appendChild(mojNoSortKey);

    const mojBound = document.createElement('table');
    mojBound.dataset.module = 'moj-sortable-table';
    mojBound.dataset.serverSort = 'true';
    mojBound.dataset.sortScope = 'assigned';
    mojBound.dataset.mojServerSortBound = 'true';
    document.body.appendChild(mojBound);

    initMojServerSorting(fetchSortedSectionWithDeps);
    mojNoButton.querySelector('thead')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    mojNoHeading.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    mojNoSortKey.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(form.querySelector('input')).toBeNull();
  });

  test('pins totals row to the end after sorting', () => {
    const stickyTable = document.createElement('table');
    stickyTable.dataset.module = 'moj-sortable-table';
    stickyTable.dataset.stickyTotals = 'true';
    stickyTable.innerHTML = `
      <tbody>
        <tr><td data-total-row="true">Total</td></tr>
        <tr><td>Row</td></tr>
      </tbody>
    `;
    document.body.appendChild(stickyTable);

    moveTotalsRowToEnd(stickyTable);
    let rows = stickyTable.querySelectorAll('tbody tr');
    expect(rows[rows.length - 1]?.textContent).toContain('Total');

    initMojTotalsRowPinning();
    stickyTable.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rows = stickyTable.querySelectorAll('tbody tr');
    expect(rows[rows.length - 1]?.textContent).toContain('Total');
  });

  test('covers export fallbacks and bound exports', () => {
    const button = document.createElement('button');
    button.dataset.exportCsvButton = 'true';
    const table = document.createElement('table');
    table.dataset.exportCsv = 'true';
    document.body.appendChild(button);
    document.body.appendChild(table);

    initTableExports();
    expect(button.dataset.exportBound).toBe('true');
    initTableExports();
  });
});
