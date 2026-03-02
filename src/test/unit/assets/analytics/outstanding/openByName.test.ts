/* @jest-environment jsdom */

import { initOpenByName, renderOpenByNameTable } from '../../../../../main/assets/js/analytics/outstanding/openByName';
import { setupAnalyticsDom } from '../analyticsTestUtils';

jest.mock('plotly.js-basic-dist-min', () => ({
  __esModule: true,
  default: {
    newPlot: jest.fn(() => Promise.resolve()),
    relayout: jest.fn(),
  },
}));

const initialOpenByNamePayload = JSON.stringify({
  breakdown: [{ name: 'Task A', urgent: 1, high: 2, medium: 3, low: 4 }],
  totals: { name: 'Total', urgent: 1, high: 2, medium: 3, low: 4 },
  chart: { data: [{ y: ['Task A'] }] },
});

type OpenByNameContainerOptions = {
  includeChart?: boolean;
  includeTable?: boolean;
  includeErrorNode?: boolean;
  initialScript?: string | null;
};

function appendOpenByNameContainer({
  includeChart = true,
  includeTable = true,
  includeErrorNode = true,
  initialScript = null,
}: OpenByNameContainerOptions = {}): HTMLElement {
  const container = document.createElement('section');
  container.dataset.openByName = 'true';
  container.innerHTML = `
    ${includeChart ? '<div data-open-by-name-chart="true"></div>' : ''}
    ${includeTable ? '<table data-open-by-name-table="true"><tbody></tbody></table>' : ''}
    ${includeErrorNode ? '<div data-open-by-name-error="true" class="govuk-visually-hidden"></div>' : ''}
    ${
      initialScript === null
        ? ''
        : `<script data-open-by-name-initial type="application/json">${initialScript}</script>`
    }
  `;
  document.body.appendChild(container);
  return container;
}

describe('analytics open by name', () => {
  beforeEach(() => {
    setupAnalyticsDom();
  });

  test('renders open-by-name content when initial data is available', async () => {
    const container = appendOpenByNameContainer({ initialScript: initialOpenByNamePayload });

    await initOpenByName();

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelectorAll('td')).toHaveLength(6);
    expect(rows[0].querySelectorAll('td')[1]?.textContent).toBe('10');
    expect(
      container.querySelector('[data-open-by-name-error="true"]')?.classList.contains('govuk-visually-hidden')
    ).toBe(true);
  });

  test('shows error state when initial open-by-name data is missing', async () => {
    const errorContainer = appendOpenByNameContainer();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await initOpenByName();

    expect(
      errorContainer.querySelector('[data-open-by-name-error="true"]')?.classList.contains('govuk-visually-hidden')
    ).toBe(false);
    expect(errorContainer.querySelector('[data-open-by-name-chart="true"]')?.textContent).toContain(
      'Unable to load chart.'
    );
    expect(errorContainer.querySelector('[data-open-by-name-table] tbody')?.textContent).toContain(
      'Unable to load open tasks.'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to load open tasks by name',
      expect.objectContaining({ message: 'Open-by-name data is unavailable.' })
    );
    errorSpy.mockRestore();
  });

  test('renders empty table fallback when there are no open tasks', () => {
    const emptyTableBody = document.createElement('tbody');
    renderOpenByNameTable(emptyTableBody, [], { name: 'Total', urgent: 0, high: 0, medium: 0, low: 0 });
    expect(emptyTableBody.textContent).toContain('No open tasks found.');
    expect(emptyTableBody.querySelector('td')?.getAttribute('colspan')).toBe('6');
  });

  test('handles open-by-name guard clauses', async () => {
    document.body.innerHTML = '';
    await initOpenByName();

    const emptyContainer = document.createElement('section');
    emptyContainer.dataset.openByName = 'true';
    document.body.appendChild(emptyContainer);
    await initOpenByName();

    emptyContainer.remove();
    appendOpenByNameContainer({
      includeErrorNode: false,
      initialScript: '{bad',
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await initOpenByName();
    expect(errorSpy).toHaveBeenCalledWith('Failed to parse initial open-by-name data', expect.any(SyntaxError));
    errorSpy.mockRestore();
  });

  test('renders without an error node when initial data is present', async () => {
    const container = appendOpenByNameContainer({
      includeErrorNode: false,
      initialScript: initialOpenByNamePayload,
    });

    await initOpenByName();

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(container.querySelector('[data-open-by-name-error="true"]')).toBeNull();
  });
});
