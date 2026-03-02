import { buildCompletedPage } from '../../../../main/modules/analytics/completed/page';
import { completedService } from '../../../../main/modules/analytics/completed/service';
import { buildCompletedViewModel } from '../../../../main/modules/analytics/completed/viewModel';
import { completedByNameChartService } from '../../../../main/modules/analytics/completed/visuals/completedByNameChartService';
import { completedComplianceSummaryService } from '../../../../main/modules/analytics/completed/visuals/completedComplianceSummaryService';
import { completedProcessingHandlingTimeService } from '../../../../main/modules/analytics/completed/visuals/completedProcessingHandlingTimeService';
import { completedRegionLocationTableService } from '../../../../main/modules/analytics/completed/visuals/completedRegionLocationTableService';
import { completedTimelineChartService } from '../../../../main/modules/analytics/completed/visuals/completedTimelineChartService';
import {
  fetchFacetedFilterStateWithFallback as fetchFilterOptionsWithFallback,
  fetchPublishedSnapshotContext,
} from '../../../../main/modules/analytics/shared/pageUtils';
import { taskThinRepository } from '../../../../main/modules/analytics/shared/repositories';
import {
  caseWorkerProfileService,
  courtVenueService,
  regionService,
} from '../../../../main/modules/analytics/shared/services';
import { AnalyticsFilters } from '../../../../main/modules/analytics/shared/types';

jest.mock('../../../../main/modules/analytics/completed/service', () => ({
  completedService: {
    buildCompleted: jest.fn(),
    buildCompletedByRegionLocation: jest.fn(),
  },
}));

jest.mock('../../../../main/modules/analytics/completed/viewModel', () => ({
  buildCompletedViewModel: jest.fn(),
}));

jest.mock('../../../../main/modules/analytics/completed/visuals/completedByNameChartService', () => ({
  completedByNameChartService: { fetchCompletedByName: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/completed/visuals/completedComplianceSummaryService', () => ({
  completedComplianceSummaryService: { fetchCompletedSummary: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/completed/visuals/completedProcessingHandlingTimeService', () => ({
  completedProcessingHandlingTimeService: { fetchCompletedProcessingHandlingTime: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/completed/visuals/completedRegionLocationTableService', () => ({
  completedRegionLocationTableService: { fetchCompletedByLocation: jest.fn(), fetchCompletedByRegion: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/completed/visuals/completedTimelineChartService', () => ({
  completedTimelineChartService: { fetchCompletedTimeline: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/shared/pageUtils', () => ({
  fetchFacetedFilterStateWithFallback: jest.fn(),
  fetchPublishedSnapshotContext: jest.fn(),
  normaliseDateRange: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils').normaliseDateRange,
  settledArrayWithFallback: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils')
    .settledArrayWithFallback,
  settledValueWithError: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils')
    .settledValueWithError,
  settledValueWithFallback: jest.requireActual('../../../../main/modules/analytics/shared/pageUtils')
    .settledValueWithFallback,
}));

jest.mock('../../../../main/modules/analytics/shared/services', () => ({
  regionService: { fetchRegionDescriptions: jest.fn() },
  courtVenueService: { fetchCourtVenueDescriptions: jest.fn() },
  caseWorkerProfileService: { fetchCaseWorkerProfileNames: jest.fn() },
}));

jest.mock('../../../../main/modules/analytics/shared/repositories', () => ({
  taskThinRepository: { fetchCompletedTaskAuditRows: jest.fn() },
}));

describe('buildCompletedPage', () => {
  const snapshotId = 103;
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

  test('builds the summary section when requested', async () => {
    const filters: AnalyticsFilters = {
      completedFrom: new Date('2024-05-10'),
      completedTo: new Date('2024-05-01'),
    };

    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [{ date: '2024-01-01', completed: 1, withinDue: 1, beyondDue: 0 }],
      completedByName: [{ taskName: 'Fallback', tasks: 1, withinDue: 1, beyondDue: 0 }],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };
    const fallbackRegionLocation = {
      byLocation: [{ location: 'Fallback', region: 'North', tasks: 1, withinDue: 1, beyondDue: 0 }],
      byRegion: [{ region: 'North', tasks: 1, withinDue: 1, beyondDue: 0 }],
    };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue(fallbackRegionLocation);
    (completedComplianceSummaryService.fetchCompletedSummary as jest.Mock)
      .mockResolvedValueOnce({ total: 10, within: 7 })
      .mockResolvedValueOnce({ total: 2, within: 1 });
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-summary' });

    const viewModel = await buildCompletedPage(filters, 'handlingTime', undefined, 'completed-summary');

    expect(viewModel).toEqual({ view: 'completed-summary' });
    expect(fetchFilterOptionsWithFallback).not.toHaveBeenCalled();
    expect(completedTimelineChartService.fetchCompletedTimeline).not.toHaveBeenCalled();
    expect(completedProcessingHandlingTimeService.fetchCompletedProcessingHandlingTime).not.toHaveBeenCalled();
    expect(completedByNameChartService.fetchCompletedByName).not.toHaveBeenCalled();
    expect(completedRegionLocationTableService.fetchCompletedByLocation).not.toHaveBeenCalled();
    expect(completedRegionLocationTableService.fetchCompletedByRegion).not.toHaveBeenCalled();
    expect(taskThinRepository.fetchCompletedTaskAuditRows).not.toHaveBeenCalled();
    expect(regionService.fetchRegionDescriptions).not.toHaveBeenCalled();
    expect(courtVenueService.fetchCourtVenueDescriptions).not.toHaveBeenCalled();
    expect(caseWorkerProfileService.fetchCaseWorkerProfileNames).not.toHaveBeenCalled();
    expect(completedComplianceSummaryService.fetchCompletedSummary).toHaveBeenCalledWith(
      snapshotId,
      filters,
      expect.objectContaining({ from: new Date('2024-05-01'), to: new Date('2024-05-10') })
    );
    expect(buildCompletedViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: expect.objectContaining({
          summary: expect.objectContaining({
            completedInRange: 10,
            withinDueYes: 7,
            withinDueNo: 3,
            completedToday: 2,
            withinDueTodayYes: 1,
            withinDueTodayNo: 1,
          }),
          timeline: fallback.timeline,
          completedByName: fallback.completedByName,
          processingHandlingTime: fallback.processingHandlingTime,
        }),
        taskAuditRows: [],
        taskAuditCaseId: '',
        selectedMetric: 'handlingTime',
      })
    );
  });

  test('defers sections on full page load', async () => {
    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [{ date: '2024-01-02', completed: 1, withinDue: 0, beyondDue: 1 }],
      completedByName: [{ taskName: 'Fallback', tasks: 1, withinDue: 0, beyondDue: 1 }],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };
    const fallbackRegionLocation = {
      byLocation: [{ location: 'Fallback', region: 'Unknown', tasks: 1, withinDue: 0, beyondDue: 1 }],
      byRegion: [{ region: 'Unknown', tasks: 1, withinDue: 0, beyondDue: 1 }],
    };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue(fallbackRegionLocation);
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
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-empty' });

    await buildCompletedPage({}, 'handlingTime');

    expect(completedComplianceSummaryService.fetchCompletedSummary).not.toHaveBeenCalled();
    expect(completedTimelineChartService.fetchCompletedTimeline).not.toHaveBeenCalled();
    expect(completedProcessingHandlingTimeService.fetchCompletedProcessingHandlingTime).not.toHaveBeenCalled();
    expect(completedByNameChartService.fetchCompletedByName).not.toHaveBeenCalled();
    expect(completedRegionLocationTableService.fetchCompletedByLocation).not.toHaveBeenCalled();
    expect(completedRegionLocationTableService.fetchCompletedByRegion).not.toHaveBeenCalled();
    expect(taskThinRepository.fetchCompletedTaskAuditRows).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).toHaveBeenCalled();
    expect(buildCompletedViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: fallback,
        completedByLocation: fallbackRegionLocation.byLocation,
        completedByRegion: fallbackRegionLocation.byRegion,
      })
    );
  });

  test('treats unknown ajax section as full page load', async () => {
    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [],
      completedByName: [],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue({ byLocation: [], byRegion: [] });
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
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-unknown' });

    await buildCompletedPage({}, 'handlingTime', undefined, 'unknown-section');

    expect(fetchFilterOptionsWithFallback).toHaveBeenCalled();
    expect(completedComplianceSummaryService.fetchCompletedSummary).not.toHaveBeenCalled();
    expect(buildCompletedViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: fallback,
      })
    );
  });

  test('builds the region and location section when requested', async () => {
    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [],
      completedByName: [],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };
    const fallbackRegionLocation = { byLocation: [], byRegion: [] };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue(fallbackRegionLocation);
    (completedRegionLocationTableService.fetchCompletedByLocation as jest.Mock).mockResolvedValue([
      { location: 'Leeds', region: 'North', tasks: 2, withinDue: 1, beyondDue: 1 },
    ]);
    (completedRegionLocationTableService.fetchCompletedByRegion as jest.Mock).mockResolvedValue([
      { region: 'North', tasks: 2, withinDue: 1, beyondDue: 1 },
    ]);
    (regionService.fetchRegionDescriptions as jest.Mock).mockResolvedValue({ North: 'North East' });
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({ Leeds: 'Leeds Crown Court' });
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-region-location' });

    await buildCompletedPage({}, 'handlingTime', undefined, 'completed-by-region-location');

    expect(completedComplianceSummaryService.fetchCompletedSummary).not.toHaveBeenCalled();
    expect(completedTimelineChartService.fetchCompletedTimeline).not.toHaveBeenCalled();
    expect(completedProcessingHandlingTimeService.fetchCompletedProcessingHandlingTime).not.toHaveBeenCalled();
    expect(completedByNameChartService.fetchCompletedByName).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).not.toHaveBeenCalled();
    expect(buildCompletedViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completedByLocation: [{ location: 'Leeds', region: 'North', tasks: 2, withinDue: 1, beyondDue: 1 }],
        completedByRegion: [{ region: 'North', tasks: 2, withinDue: 1, beyondDue: 1 }],
        regionDescriptions: { North: 'North East' },
        locationDescriptions: { Leeds: 'Leeds Crown Court' },
      })
    );
  });

  test('builds the processing handling time section when requested', async () => {
    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [],
      completedByName: [],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };
    const fallbackRegionLocation = { byLocation: [], byRegion: [] };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue(fallbackRegionLocation);
    (completedProcessingHandlingTimeService.fetchCompletedProcessingHandlingTime as jest.Mock).mockResolvedValue([
      {
        date: '2024-05-01',
        tasks: 2,
        handlingAverageDays: 1,
        handlingStdDevDays: 0.5,
        handlingSumDays: 2,
        handlingCount: 2,
        processingAverageDays: 2,
        processingStdDevDays: 1,
        processingSumDays: 4,
        processingCount: 2,
      },
    ]);
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-processing-handling' });

    await buildCompletedPage({}, 'processingTime', undefined, 'completed-processing-handling-time');

    expect(completedComplianceSummaryService.fetchCompletedSummary).not.toHaveBeenCalled();
    expect(completedTimelineChartService.fetchCompletedTimeline).not.toHaveBeenCalled();
    expect(completedByNameChartService.fetchCompletedByName).not.toHaveBeenCalled();
    expect(completedRegionLocationTableService.fetchCompletedByLocation).not.toHaveBeenCalled();
    expect(fetchFilterOptionsWithFallback).not.toHaveBeenCalled();
    expect(buildCompletedViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: expect.objectContaining({
          processingHandlingTime: [
            {
              date: '2024-05-01',
              tasks: 2,
              handlingAverageDays: 1,
              handlingStdDevDays: 0.5,
              handlingSumDays: 2,
              handlingCount: 2,
              processingAverageDays: 2,
              processingStdDevDays: 1,
              processingSumDays: 4,
              processingCount: 2,
            },
          ],
        }),
        selectedMetric: 'processingTime',
      })
    );
  });

  test('maps task audit rows when a case ID is provided', async () => {
    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [],
      completedByName: [],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };
    const fallbackRegionLocation = { byLocation: [], byRegion: [] };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue(fallbackRegionLocation);
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({ Leeds: 'Leeds Crown Court' });
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({ 'user-1': 'Agent One' });
    (taskThinRepository.fetchCompletedTaskAuditRows as jest.Mock).mockResolvedValue([
      {
        case_id: 'CASE-123',
        task_name: null,
        assignee: 'user-1',
        completed_date: null,
        number_of_reassignments: 2,
        location: 'Leeds',
        termination_process_label: null,
        outcome: 'Completed',
      },
    ]);
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-audit' });

    await buildCompletedPage({}, 'handlingTime', 'CASE-123', 'completed-task-audit');

    expect(buildCompletedViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        taskAuditRows: [
          {
            caseId: 'CASE-123',
            taskName: null,
            agentName: 'Agent One',
            completedDate: '-',
            completedDateRaw: '-',
            totalAssignments: 3,
            location: 'Leeds Crown Court',
            status: null,
            outcome: 'Completed',
          },
        ],
        taskAuditCaseId: 'CASE-123',
      })
    );
  });

  test('maps task audit rows with missing assignee and location', async () => {
    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [],
      completedByName: [],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue({ byLocation: [], byRegion: [] });
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockResolvedValue({});
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockResolvedValue({});
    (taskThinRepository.fetchCompletedTaskAuditRows as jest.Mock).mockResolvedValue([
      {
        case_id: 'CASE-EMPTY',
        task_name: null,
        assignee: null,
        completed_date: null,
        number_of_reassignments: null,
        location: null,
        termination_process_label: null,
        outcome: null,
      },
    ]);
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-empty-audit' });

    await buildCompletedPage({}, 'handlingTime', 'CASE-EMPTY', 'completed-task-audit');

    expect(buildCompletedViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        taskAuditRows: [
          expect.objectContaining({
            agentName: null,
            location: null,
            totalAssignments: 1,
            taskName: null,
            completedDate: '-',
            completedDateRaw: '-',
            status: null,
            outcome: null,
          }),
        ],
      })
    );
  });

  test('uses exact completed filter-options fallback message on full page load', async () => {
    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [],
      completedByName: [],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue({ byLocation: [], byRegion: [] });
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
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-filter-options' });

    await buildCompletedPage({}, 'handlingTime', undefined, 'unknown-section');

    expect(fetchFilterOptionsWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Failed to fetch completed filter options from database',
        snapshotId,
      })
    );
  });

  test('logs exact section fallback messages for completed page fetch failures', async () => {
    const fallback = {
      summary: {
        completedToday: 0,
        completedInRange: 0,
        withinDueYes: 0,
        withinDueNo: 0,
        withinDueTodayYes: 0,
        withinDueTodayNo: 0,
      },
      timeline: [],
      completedByName: [],
      handlingTimeStats: { metric: 'handlingTime', averageDays: 0, lowerRange: 0, upperRange: 0 },
      processingHandlingTime: [],
    };

    (completedService.buildCompleted as jest.Mock).mockReturnValue(fallback);
    (completedService.buildCompletedByRegionLocation as jest.Mock).mockReturnValue({ byLocation: [], byRegion: [] });
    (completedComplianceSummaryService.fetchCompletedSummary as jest.Mock).mockRejectedValue(new Error('db'));
    (completedTimelineChartService.fetchCompletedTimeline as jest.Mock).mockRejectedValue(new Error('db'));
    (completedProcessingHandlingTimeService.fetchCompletedProcessingHandlingTime as jest.Mock).mockRejectedValue(
      new Error('db')
    );
    (completedByNameChartService.fetchCompletedByName as jest.Mock).mockRejectedValue(new Error('db'));
    (completedRegionLocationTableService.fetchCompletedByLocation as jest.Mock).mockRejectedValue(new Error('db'));
    (completedRegionLocationTableService.fetchCompletedByRegion as jest.Mock).mockRejectedValue(new Error('db'));
    (taskThinRepository.fetchCompletedTaskAuditRows as jest.Mock).mockRejectedValue(new Error('db'));
    (caseWorkerProfileService.fetchCaseWorkerProfileNames as jest.Mock).mockRejectedValue(new Error('db'));
    (regionService.fetchRegionDescriptions as jest.Mock).mockRejectedValue(new Error('db'));
    (courtVenueService.fetchCourtVenueDescriptions as jest.Mock).mockRejectedValue(new Error('db'));
    (buildCompletedViewModel as jest.Mock).mockReturnValue({ view: 'completed-errors' });

    await buildCompletedPage({}, 'handlingTime', 'CASE-FAIL', 'completed-task-audit');
    await buildCompletedPage({}, 'handlingTime', undefined, 'completed-summary');
    await buildCompletedPage({}, 'handlingTime', undefined, 'completed-timeline');
    await buildCompletedPage({}, 'handlingTime', undefined, 'completed-processing-handling-time');
    await buildCompletedPage({}, 'handlingTime', undefined, 'completed-by-name');
    await buildCompletedPage({}, 'handlingTime', undefined, 'completed-by-region-location');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch completed summary from database', expect.any(Error));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch completed today summary from database',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch completed timeline from database', expect.any(Error));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch processing/handling time stats from database',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch completed by name from database', expect.any(Error));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch completed by location from database',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch completed by region from database',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch completed task audit rows from database',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch case worker profiles from database',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch region descriptions from database',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch court venue descriptions from database',
      expect.any(Error)
    );
  });
});
