import { buildOverviewPage } from '../../../../main/modules/analytics/overview/page';
import { overviewService } from '../../../../main/modules/analytics/overview/service';
import { buildOverviewViewModel } from '../../../../main/modules/analytics/overview/viewModel';
import { serviceOverviewTableService } from '../../../../main/modules/analytics/overview/visuals/serviceOverviewTableService';
import { taskEventsByServiceChartService } from '../../../../main/modules/analytics/overview/visuals/taskEventsByServiceChartService';
import {
  fetchFacetedFilterStateWithFallback as fetchFilterOptionsWithFallback,
  fetchPublishedSnapshotContext,
} from '../../../../main/modules/analytics/shared/pageUtils';

jest.mock('../../../../main/modules/analytics/overview/service', () => ({
  overviewService: { buildOverview: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/overview/viewModel', () => ({
  buildOverviewViewModel: jest.fn(),
}));

jest.mock('../../../../main/modules/analytics/overview/visuals/serviceOverviewTableService', () => ({
  serviceOverviewTableService: { fetchServiceOverview: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/overview/visuals/taskEventsByServiceChartService', () => ({
  taskEventsByServiceChartService: { fetchTaskEventsByService: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/shared/pageUtils', () => ({
  fetchFacetedFilterStateWithFallback: jest.fn(),
  fetchPublishedSnapshotContext: jest.fn(),
  resolveDateRangeWithDefaults: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils')
    .resolveDateRangeWithDefaults,
  settledValueWithError: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils')
    .settledValueWithError,
}));

describe('buildOverviewPage', () => {
  const snapshotId = 101;
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchPublishedSnapshotContext as jest.Mock).mockResolvedValue({
      snapshotId,
      publishedAt: new Date('2026-02-17T10:15:00.000Z'),
      freshnessInsetText: 'Data last refreshed: 17 February 2026 at 10:15 GMT.',
    });
  });

  test('builds service performance overview when requested', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (serviceOverviewTableService.fetchServiceOverview as jest.Mock).mockResolvedValue({
      serviceRows: [
        {
          service: 'Service A',
          open: 10,
          assigned: 5,
          assignedPct: 50,
          urgent: 1,
          high: 1,
          medium: 1,
          low: 2,
        },
      ],
      totals: {
        service: 'Total',
        open: 10,
        assigned: 5,
        assignedPct: 50,
        urgent: 1,
        high: 1,
        medium: 1,
        low: 2,
      },
    });
    (taskEventsByServiceChartService.fetchTaskEventsByService as jest.Mock).mockResolvedValue({
      rows: [{ service: 'Service A', completed: 2, cancelled: 1, created: 3 }],
      totals: { service: 'Total', completed: 2, cancelled: 1, created: 3 },
    });
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview' });

    const viewModel = await buildOverviewPage({}, 'overview-service-performance');

    expect(viewModel).toEqual({ view: 'overview' });
    expect(taskEventsByServiceChartService.fetchTaskEventsByService).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).not.toHaveBeenCalled();
    expect(buildOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        overview: expect.objectContaining({
          serviceRows: [
            { service: 'Service A', open: 10, assigned: 5, assignedPct: 50, urgent: 1, high: 1, medium: 1, low: 2 },
          ],
        }),
        taskEventsRows: [],
      })
    );
  });

  test('builds task events when requested', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (taskEventsByServiceChartService.fetchTaskEventsByService as jest.Mock).mockResolvedValue({
      rows: [{ service: 'Service A', completed: 2, cancelled: 1, created: 3 }],
      totals: { service: 'Total', completed: 2, cancelled: 1, created: 3 },
    });
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-task-events' });

    await buildOverviewPage({}, 'overview-task-events');

    expect(serviceOverviewTableService.fetchServiceOverview).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).not.toHaveBeenCalled();
    expect(buildOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        overview: fallback,
        taskEventsRows: [{ service: 'Service A', completed: 2, cancelled: 1, created: 3 }],
        taskEventsTotals: { service: 'Total', completed: 2, cancelled: 1, created: 3 },
      })
    );
  });

  test('defers overview sections on full page load', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (fetchFilterOptionsWithFallback as jest.Mock).mockResolvedValue({
      filters: {},
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
    });
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-empty' });

    await buildOverviewPage({});

    expect(serviceOverviewTableService.fetchServiceOverview).not.toHaveBeenCalled();
    expect(taskEventsByServiceChartService.fetchTaskEventsByService).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).toHaveBeenCalled();
    expect(buildOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        overview: fallback,
      })
    );
  });

  test('falls back when service overview fails', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (serviceOverviewTableService.fetchServiceOverview as jest.Mock).mockRejectedValue(new Error('db'));
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-fallback' });

    await buildOverviewPage({}, 'overview-service-performance');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch service overview from database', expect.any(Error));
    expect(buildOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        overview: fallback,
      })
    );
  });

  test('keeps fallback overview when no service rows are returned', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (serviceOverviewTableService.fetchServiceOverview as jest.Mock).mockResolvedValue({
      serviceRows: [],
      totals: {
        service: 'Mutated',
        open: 99,
        assigned: 88,
        assignedPct: 12,
        urgent: 9,
        high: 8,
        medium: 7,
        low: 6,
      },
    });
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-empty' });

    await buildOverviewPage({}, 'overview-service-performance');

    expect(buildOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        overview: fallback,
      })
    );
  });

  test('passes explicit events range to task-events fetcher', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (taskEventsByServiceChartService.fetchTaskEventsByService as jest.Mock).mockResolvedValue({
      rows: [],
      totals: { service: 'Total', completed: 0, cancelled: 0, created: 0 },
    });
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-task-events' });

    await buildOverviewPage(
      {
        eventsFrom: new Date('2024-02-01T00:00:00.000Z'),
        eventsTo: new Date('2024-02-05T00:00:00.000Z'),
      },
      'overview-task-events'
    );

    expect(taskEventsByServiceChartService.fetchTaskEventsByService).toHaveBeenCalledWith(
      snapshotId,
      {
        eventsFrom: new Date('2024-02-01T00:00:00.000Z'),
        eventsTo: new Date('2024-02-05T00:00:00.000Z'),
      },
      expect.objectContaining({
        from: new Date('2024-02-01T00:00:00.000Z'),
        to: new Date('2024-02-05T00:00:00.000Z'),
      })
    );
    expect(buildOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        taskEventsTotals: { service: 'Total', completed: 0, cancelled: 0, created: 0 },
      })
    );
  });

  test('logs exact task-event failure message and keeps fallback totals', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (taskEventsByServiceChartService.fetchTaskEventsByService as jest.Mock).mockRejectedValue(new Error('db'));
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-task-events-fallback' });

    await buildOverviewPage({}, 'overview-task-events');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch task events by service from database',
      expect.any(Error)
    );
    expect(buildOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        taskEventsRows: [],
        taskEventsTotals: { service: 'Total', completed: 0, cancelled: 0, created: 0 },
      })
    );
  });

  test('uses exact overview filter-options fallback message on full page load', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (fetchFilterOptionsWithFallback as jest.Mock).mockResolvedValue({
      filters: {},
      filterOptions: {
        services: [],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
    });
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-empty' });

    await buildOverviewPage({});

    expect(fetchFilterOptionsWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Failed to fetch overview filter options from database',
        snapshotId,
      })
    );
  });

  test('treats unknown ajax sections as full-page requests', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (fetchFilterOptionsWithFallback as jest.Mock).mockResolvedValue({
      filters: { service: ['Civil'] },
      filterOptions: {
        services: ['Civil'],
        roleCategories: [],
        regions: [],
        locations: [],
        taskNames: [],
        workTypes: [],
        users: [],
      },
    });
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-unknown-section' });

    await buildOverviewPage({ service: ['Civil'] }, 'not-a-real-section');

    expect(fetchFilterOptionsWithFallback).toHaveBeenCalled();
    expect(serviceOverviewTableService.fetchServiceOverview).not.toHaveBeenCalled();
    expect(taskEventsByServiceChartService.fetchTaskEventsByService).not.toHaveBeenCalled();
  });

  test('falls back to empty filter options when faceted filter state retrieval rejects', async () => {
    const fallback = {
      serviceRows: [],
      totals: {
        service: 'Total',
        open: 0,
        assigned: 0,
        assignedPct: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (overviewService.buildOverview as jest.Mock).mockReturnValue(fallback);
    (fetchFilterOptionsWithFallback as jest.Mock).mockRejectedValue(new Error('faceted-failed'));
    (buildOverviewViewModel as jest.Mock).mockReturnValue({ view: 'overview-faceted-fallback' });

    await buildOverviewPage({}, 'not-a-real-section');

    expect(buildOverviewViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {},
        filterOptions: {
          services: [],
          roleCategories: [],
          regions: [],
          locations: [],
          taskNames: [],
          workTypes: [],
          users: [],
        },
      })
    );
  });
});
