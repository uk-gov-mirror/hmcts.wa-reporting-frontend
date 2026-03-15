import { buildOverviewViewModel } from '../../../../main/modules/analytics/overview/viewModel';

describe('buildOverviewViewModel', () => {
  test('builds table rows and date picker values', () => {
    const viewModel = buildOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview: {
        serviceRows: [
          {
            service: 'Service A',
            open: 10,
            assigned: 5,
            assignedPct: 50,
            urgent: 2,
            high: 1,
            medium: 1,
            low: 1,
          },
        ],
        totals: {
          service: 'Total',
          open: 10,
          assigned: 5,
          assignedPct: 50,
          urgent: 2,
          high: 1,
          medium: 1,
          low: 1,
        },
      },
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      allTasks: [],
      taskEventsRows: [{ service: 'Service A', completed: 3, cancelled: 1, created: 7 }],
      taskEventsTotals: { service: 'Total', completed: 3, cancelled: 1, created: 7 },
      eventsRange: { from: new Date('2024-01-05'), to: new Date('2024-01-10') },
    });

    expect(viewModel.rows).toHaveLength(1);
    expect(viewModel.tableRows[0][0].text).toBe('Service A');
    expect(viewModel.tableRows[0][1].attributes?.['data-sort-value']).toBe('10');
    expect(viewModel.totalsRow[0].attributes?.['data-total-row']).toBe('true');
    expect(viewModel.eventsFromValue).toBe('05/01/2024');
    expect(viewModel.eventsToValue).toBe('10/01/2024');
    expect(viewModel.taskEventsRows[0]).toHaveLength(4);
    expect(viewModel.taskEventsRows[0][0].text).toBe('Service A');
    expect(viewModel.taskEventsRows[0][1].text).toBe('7');
    expect(viewModel.taskEventsRows[0][2].text).toBe('3');
    expect(viewModel.taskEventsRows[0][3].text).toBe('1');
  });

  test('sorts rows alphabetically and builds totals rows', () => {
    const viewModel = buildOverviewViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      sectionErrors: {},
      overview: {
        serviceRows: [
          {
            service: 'Service B',
            open: 5,
            assigned: 2,
            assignedPct: 40,
            urgent: 1,
            high: 0,
            medium: 1,
            low: 0,
          },
          {
            service: 'Service A',
            open: 7,
            assigned: 3,
            assignedPct: 42.8,
            urgent: 1,
            high: 1,
            medium: 0,
            low: 1,
          },
        ],
        totals: {
          service: 'Total',
          open: 12,
          assigned: 5,
          assignedPct: 41.7,
          urgent: 2,
          high: 1,
          medium: 1,
          low: 1,
        },
      },
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      allTasks: [],
      taskEventsRows: [],
      taskEventsTotals: { service: 'Total', completed: 0, cancelled: 0, created: 0 },
      eventsRange: { from: new Date('2024-02-01'), to: new Date('2024-02-02') },
    });

    expect(viewModel.rows[0].service).toBe('Service A');
    expect(viewModel.totalsRow[0].text).toBe('Total');
    expect(viewModel.taskEventsTotalsRow[0].attributes?.['data-total-row']).toBe('true');
    expect(viewModel.taskEventsTotalsRow[0].text).toBe('Total');
    expect(viewModel.taskEventsTotalsRow).toHaveLength(4);
    expect(viewModel.taskEventsTotalsRow[3].text).toBe('0');
  });
});
