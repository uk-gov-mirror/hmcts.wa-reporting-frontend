import { __testing, buildOutstandingViewModel } from '../../../../main/modules/analytics/outstanding/viewModel';
import { getDefaultOutstandingSort } from '../../../../main/modules/analytics/shared/outstandingSort';

describe('buildOutstandingViewModel', () => {
  test('builds totals rows and chart bindings', () => {
    const viewModel = buildOutstandingViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [{ value: 'North', text: 'North East' }],
        locations: [{ value: 'Leeds', text: 'Leeds Crown Court' }],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      sort: getDefaultOutstandingSort(),
      criticalTasksPage: 1,
      criticalTasksTotalResults: 0,
      allTasks: [],
      summary: {
        open: 4,
        assigned: 2,
        unassigned: 2,
        assignedPct: 50,
        unassignedPct: 50,
        urgent: 1,
        high: 1,
        medium: 1,
        low: 1,
      },
      charts: {
        openTasks: 'open',
        waitTime: 'wait',
        tasksDue: 'due',
        tasksDueByPriority: 'priority',
        priorityDonut: 'priorityDonut',
        assignmentDonut: 'assignmentDonut',
      },
      openByNameInitial: {
        breakdown: [{ name: 'Task A', urgent: 1, high: 0, medium: 0, low: 0 }],
        totals: { name: 'Total', urgent: 1, high: 0, medium: 0, low: 0 },
        chart: {},
      },
      openByCreated: [{ date: '2024-01-01', open: 2, assigned: 1, unassigned: 1, assignedPct: 50, unassignedPct: 50 }],
      waitTime: [{ date: '2024-01-01', averageWaitDays: 2.345, assignedCount: 1, totalWaitDays: 2.345 }],
      dueByDate: [{ date: '2024-01-01', totalDue: 3, open: 2, completed: 1 }],
      priorityByDueDate: [{ date: '2024-01-01', urgent: 1, high: 1, medium: 0, low: 0 }],
      criticalTasks: [],
      outstandingByLocation: [{ location: 'Leeds', region: 'North', open: 3, urgent: 1, high: 1, medium: 1, low: 0 }],
      outstandingByRegion: [{ region: 'North', open: 3, urgent: 1, high: 1, medium: 1, low: 0 }],
      regionDescriptions: { North: 'North East' },
      locationDescriptions: { Leeds: 'Leeds Crown Court' },
    });

    expect(viewModel.openTasksTotalsRow[0].text).toBe('Total');
    expect(viewModel.openTasksTotalsRow[0].attributes?.['data-total-row']).toBe('true');
    expect(viewModel.openTasksRows[0][1].attributes?.['data-sort-value']).toBe('2');
    expect(viewModel.openTasksRows[0][3].text).toBe('50.0%');
    expect(viewModel.openByNameRows[0]).toHaveLength(6);
    expect(viewModel.openByNameRows[0][1].text).toBe('1');
    expect(viewModel.openByNameTotalsRow[1].text).toBe('1');
    expect(viewModel.openByNameTotalsRow[2].text).toBe('1');
    expect(viewModel.openByNameTotalsRow[0].attributes?.['data-total-row']).toBe('true');
    expect(viewModel.openByNameTotalsRow).toHaveLength(6);
    expect(viewModel.waitTimeRows[0][2].text).toBe('2.35');
    expect(viewModel.waitTimeTotalsRow[2].text).toBe('2.35');
    expect(viewModel.waitTimeTotalsRow[2].attributes?.['data-sort-value']).toBe('2.345');
    expect(viewModel.charts.openTasks).toBe('open');
    expect(viewModel.outstandingByLocationRows[0][0].text).toBe('Leeds Crown Court');
    expect(viewModel.outstandingByRegionRows[0][0].text).toBe('North East');
    expect(viewModel.criticalTasksHead[0].attributes?.['data-sort-key']).toBe('caseId');
    expect(viewModel.criticalTasksHead[6].attributes?.['data-sort-default-dir']).toBe('desc');
    expect(viewModel.criticalTasksPagination.page).toBe(1);
    expect(viewModel.criticalTasksPagination.totalResults).toBe(0);
    expect(viewModel.criticalTasksPagination.show).toBe(false);
  });

  test('handles empty timelines and builds region/location rows', () => {
    const viewModel = buildOutstandingViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [{ value: 'North', text: 'North East' }],
        locations: [{ value: 'Leeds', text: 'Leeds Crown Court' }],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      sort: getDefaultOutstandingSort(),
      criticalTasksPage: 1,
      criticalTasksTotalResults: 1,
      allTasks: [],
      summary: {
        open: 0,
        assigned: 0,
        unassigned: 0,
        assignedPct: 0,
        unassignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      charts: {
        openTasks: 'open',
        waitTime: 'wait',
        tasksDue: 'due',
        tasksDueByPriority: 'priority',
        priorityDonut: 'priorityDonut',
        assignmentDonut: 'assignmentDonut',
      },
      openByNameInitial: {
        breakdown: [],
        totals: { name: 'Total', urgent: 0, high: 0, medium: 0, low: 0 },
        chart: {},
      },
      openByCreated: [],
      waitTime: [],
      dueByDate: [],
      priorityByDueDate: [],
      criticalTasks: [
        {
          caseId: 'CASE-1',
          caseType: 'Service A',
          location: 'Leeds',
          taskName: 'Review',
          createdDate: '2024-01-01',
          dueDate: undefined,
          priority: 'Urgent',
          agentName: 'Sam',
        },
      ],
      outstandingByLocation: [{ location: 'Leeds', region: 'North', open: 1, urgent: 1, high: 0, medium: 0, low: 0 }],
      outstandingByRegion: [{ region: 'North', open: 1, urgent: 1, high: 0, medium: 0, low: 0 }],
      regionDescriptions: { North: 'North East' },
      locationDescriptions: { Leeds: 'Leeds Crown Court' },
    });

    expect(viewModel.openTasksTotalsRow[3].text).toBe('0%');
    expect(viewModel.outstandingByLocationRows[0][0].text).toBe('Leeds Crown Court');
    expect(viewModel.outstandingByRegionLocationRows[0][0].text).toBe('North East');
    expect(viewModel.criticalTasks[0].dueDate).toBeUndefined();
    expect(viewModel.criticalTasks[0].prioritySortValue).toBe(4);
    expect(viewModel.criticalTasksPagination.totalResults).toBe(1);
    expect(viewModel.criticalTasksPagination.totalPages).toBe(1);
  });

  test('sorts region and region-location rows consistently', () => {
    const viewModel = buildOutstandingViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [
          { value: 'North', text: 'North East' },
          { value: 'South', text: 'South West' },
        ],
        locations: [{ value: 'Leeds', text: 'Leeds Crown Court' }],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      sort: getDefaultOutstandingSort(),
      criticalTasksPage: 1,
      criticalTasksTotalResults: 0,
      allTasks: [],
      summary: {
        open: 2,
        assigned: 1,
        unassigned: 1,
        assignedPct: 50,
        unassignedPct: 50,
        urgent: 0,
        high: 1,
        medium: 0,
        low: 1,
      },
      charts: {
        openTasks: '',
        waitTime: '',
        tasksDue: '',
        tasksDueByPriority: '',
        priorityDonut: '',
        assignmentDonut: '',
      },
      openByNameInitial: {
        breakdown: [],
        totals: { name: 'Total', urgent: 0, high: 0, medium: 0, low: 0 },
        chart: {},
      },
      openByCreated: [],
      waitTime: [],
      dueByDate: [],
      priorityByDueDate: [],
      criticalTasks: [],
      outstandingByLocation: [
        { location: 'Leeds', region: 'South', open: 1, urgent: 0, high: 1, medium: 0, low: 0 },
        { location: 'Leeds', region: 'North', open: 1, urgent: 0, high: 0, medium: 0, low: 1 },
        { location: 'York', region: 'North', open: 1, urgent: 0, high: 0, medium: 1, low: 0 },
      ],
      outstandingByRegion: [
        { region: 'South', open: 1, urgent: 0, high: 1, medium: 0, low: 0 },
        { region: 'North', open: 1, urgent: 0, high: 0, medium: 0, low: 1 },
      ],
      regionDescriptions: { North: 'North East', South: 'South West' },
      locationDescriptions: { Leeds: 'Leeds Crown Court' },
    });

    expect(viewModel.outstandingByRegionRows[0][0].text).toBe('North East');
    expect(viewModel.outstandingByRegionRows[1][0].text).toBe('South West');
    expect(viewModel.outstandingByRegionLocationRows[0][0].text).toBe('North East');
    expect(viewModel.outstandingByRegionLocationRows[0][1].text).toBe('Leeds Crown Court');
    expect(viewModel.outstandingByRegionLocationRows[1][0].text).toBe('North East');
    expect(viewModel.outstandingByRegionLocationRows[1][1].text).toBe('York');
    expect(viewModel.outstandingByRegionLocationRows[2][0].text).toBe('South West');
    expect(viewModel.outstandingByRegionLocationRows[2][1].text).toBe('Leeds Crown Court');
    expect(viewModel.criticalTasksPagination.pageSize).toBe(50);
  });

  test('formats percent cells via helper', () => {
    const { buildOutstandingLocationRows, buildOutstandingRegionRows, buildPercentCell } = __testing;

    expect(buildPercentCell(25, { minimumFractionDigits: 1 }).text).toContain('25');

    const locationRows = buildOutstandingLocationRows(
      [
        { location: 'Same', region: 'North', open: 1, urgent: 0, high: 0, medium: 0, low: 1 },
        { location: 'Same', region: 'South', open: 2, urgent: 0, high: 1, medium: 0, low: 0 },
      ],
      true,
      { Same: 'Same Location' },
      { North: 'North', South: 'South' }
    );
    expect(locationRows[0][0].text).toBe('North');
    expect(locationRows[0][1].text).toBe('Same Location');

    const locationRowsNoRegion = buildOutstandingLocationRows(
      [{ location: 'Only', region: 'North', open: 1, urgent: 0, high: 0, medium: 0, low: 1 }],
      false,
      { Only: 'Only Location' },
      {}
    );
    expect(locationRowsNoRegion[0][0].text).toBe('Only Location');

    const regionRows = buildOutstandingRegionRows(
      [
        { region: 'South', open: 1, urgent: 0, high: 1, medium: 0, low: 0 },
        { region: 'North', open: 1, urgent: 0, high: 0, medium: 0, low: 1 },
      ],
      { North: 'North', South: 'South' }
    );
    expect(regionRows[0][0].text).toBe('North');

    jest.isolateModules(() => {
      const { __testing: isolated } = require('../../../../main/modules/analytics/outstanding/viewModel');
      expect(isolated.buildPercentCell(12.5).text).toContain('12');
    });
  });

  test('builds consistent totals for region, location, and region-location tables', () => {
    const viewModel = buildOutstandingViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      sort: getDefaultOutstandingSort(),
      criticalTasksPage: 1,
      criticalTasksTotalResults: 0,
      allTasks: [],
      summary: {
        open: 3,
        assigned: 1,
        unassigned: 2,
        assignedPct: 33.3,
        unassignedPct: 66.7,
        urgent: 1,
        high: 1,
        medium: 1,
        low: 0,
      },
      charts: {
        openTasks: '',
        waitTime: '',
        tasksDue: '',
        tasksDueByPriority: '',
        priorityDonut: '',
        assignmentDonut: '',
      },
      openByNameInitial: {
        breakdown: [],
        totals: { name: 'Total', urgent: 0, high: 0, medium: 0, low: 0 },
        chart: {},
      },
      openByCreated: [],
      waitTime: [],
      dueByDate: [],
      priorityByDueDate: [],
      criticalTasks: [],
      outstandingByLocation: [
        { location: 'L1', region: 'R1', open: 1, urgent: 1, high: 0, medium: 0, low: 0 },
        { location: 'L2', region: 'R2', open: 2, urgent: 0, high: 1, medium: 1, low: 0 },
      ],
      outstandingByRegion: [
        { region: 'R1', open: 1, urgent: 1, high: 0, medium: 0, low: 0 },
        { region: 'R2', open: 2, urgent: 0, high: 1, medium: 1, low: 0 },
      ],
      regionDescriptions: {},
      locationDescriptions: {},
    });

    expect(viewModel.outstandingByRegionTotalsRow.map(cell => cell.text)).toEqual(['Total', '3', '1', '1', '1', '0']);
    expect(viewModel.outstandingByLocationTotalsRow.map(cell => cell.text)).toEqual(['Total', '3', '1', '1', '1', '0']);
    expect(viewModel.outstandingByRegionLocationTotalsRow.map(cell => cell.text)).toEqual([
      'Total',
      '',
      '3',
      '1',
      '1',
      '1',
      '0',
    ]);
  });

  test('falls back to raw location label when description lookup is missing', () => {
    const viewModel = buildOutstandingViewModel({
      filters: {},
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
      sort: getDefaultOutstandingSort(),
      criticalTasksPage: 1,
      criticalTasksTotalResults: 1,
      allTasks: [],
      summary: {
        open: 1,
        assigned: 1,
        unassigned: 0,
        assignedPct: 100,
        unassignedPct: 0,
        urgent: 1,
        high: 0,
        medium: 0,
        low: 0,
      },
      charts: {
        openTasks: '',
        waitTime: '',
        tasksDue: '',
        tasksDueByPriority: '',
        priorityDonut: '',
        assignmentDonut: '',
      },
      openByNameInitial: {
        breakdown: [],
        totals: { name: 'Total', urgent: 0, high: 0, medium: 0, low: 0 },
        chart: {},
      },
      openByCreated: [],
      waitTime: [],
      dueByDate: [],
      priorityByDueDate: [],
      criticalTasks: [
        {
          caseId: 'CASE-X',
          caseType: 'Service A',
          location: 'LOC-X',
          taskName: 'Review',
          createdDate: '2024-01-01',
          dueDate: '2024-01-10',
          priority: 'Urgent',
          agentName: 'Pat',
        },
      ],
      outstandingByLocation: [{ location: 'LOC-X', region: 'REG-X', open: 1, urgent: 1, high: 0, medium: 0, low: 0 }],
      outstandingByRegion: [{ region: 'REG-X', open: 1, urgent: 1, high: 0, medium: 0, low: 0 }],
      regionDescriptions: {},
      locationDescriptions: {},
    });

    expect(viewModel.criticalTasks[0].location).toBe('LOC-X');
  });
});
