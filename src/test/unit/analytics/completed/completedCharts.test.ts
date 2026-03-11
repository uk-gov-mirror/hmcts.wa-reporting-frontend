import {
  buildCompletedByNameChart,
  buildComplianceChart,
  buildHandlingChart,
  buildProcessingHandlingTimeChart,
  buildTimelineChart,
} from '../../../../main/modules/analytics/completed/visuals/charts';
import { chartColors } from '../../../../main/modules/analytics/shared/charts/colors';

describe('completedCharts', () => {
  test('buildComplianceChart uses summary values', () => {
    const config = JSON.parse(buildComplianceChart({ withinDueYes: 2, withinDueNo: 1 }));
    expect(config.data[0].values).toEqual([2, 1]);
    expect(config.data[0].labels).toEqual(['Within due date', 'Beyond due date']);
    expect(config.data[0].marker.colors).toEqual([chartColors.blue, chartColors.grey]);
    expect(config.data[0].type).toBe('pie');
  });

  test('buildTimelineChart uses timeline data', () => {
    const config = JSON.parse(
      buildTimelineChart([
        { date: '2024-01-01', completed: 3, withinDue: 2, beyondDue: 1 },
        { date: '2024-01-02', completed: 1, withinDue: 1, beyondDue: 0 },
      ])
    );
    expect(config.data[0].x).toEqual(['2024-01-01', '2024-01-02']);
    expect(config.data[0].name).toBe('Within due');
    expect(config.data[1].name).toBe('Beyond due');
    expect(config.data[2].name).toBe('Total - 7-day average');
    expect(config.data[2].mode).toBe('lines');
    expect(config.layout.dragmode).toBe('pan');
    expect(config.layout.xaxis.title.text).toBe('Completed date');
    expect(config.layout.xaxis.fixedrange).toBe(false);
    expect(config.layout.yaxis.title.text).toBe('Tasks');
  });

  test('buildCompletedByNameChart uses task counts', () => {
    const config = JSON.parse(
      buildCompletedByNameChart([
        { taskName: 'Review', tasks: 4, withinDue: 3, beyondDue: 1 },
        { taskName: 'Audit', tasks: 2, withinDue: 1, beyondDue: 1 },
      ])
    );
    expect(config.data[0].x).toEqual([3, 1]);
    expect(config.data[0].name).toBe('Within due date');
    expect(config.data[1].name).toBe('Outside due date');
    expect(config.layout.legend.orientation).toBe('h');
    expect(config.layout.yaxis.categoryarray).toEqual(['Review', 'Audit']);
  });

  test('buildCompletedByNameChart sorts by name when totals tie', () => {
    const config = JSON.parse(
      buildCompletedByNameChart([
        { taskName: 'Beta', tasks: 2, withinDue: 1, beyondDue: 1 },
        { taskName: 'Alpha', tasks: 2, withinDue: 2, beyondDue: 0 },
      ])
    );

    expect(config.layout.yaxis.categoryarray).toEqual(['Alpha', 'Beta']);
  });

  test('buildHandlingChart uses average and ranges', () => {
    const config = JSON.parse(
      buildHandlingChart({ metric: 'handlingTime', averageDays: 2, lowerRange: 1, upperRange: 3 })
    );
    expect(config.data[0].x).toEqual(['Average']);
    expect(config.data[0].y).toEqual([2]);
    expect(config.data[0].type).toBe('bar');
    expect(config.data[0].marker.color).toBe(chartColors.blueDark);
    expect(config.data[0].error_y.type).toBe('data');
    expect(config.data[0].error_y.symmetric).toBe(false);
    expect(config.data[0].error_y.array).toEqual([1]);
    expect(config.data[0].error_y.arrayminus).toEqual([1]);
    expect(config.layout.margin.t).toBe(20);
    expect(config.layout.yaxis.title.text).toBe('Days');
  });

  test('buildProcessingHandlingTimeChart uses processing metrics when selected', () => {
    const config = JSON.parse(
      buildProcessingHandlingTimeChart(
        [
          {
            date: '2024-01-01',
            tasks: 2,
            handlingAverageDays: 1,
            handlingStdDevDays: 0.5,
            handlingSumDays: 2,
            handlingCount: 2,
            processingAverageDays: 2.5,
            processingStdDevDays: 0.5,
            processingSumDays: 5,
            processingCount: 2,
          },
        ],
        'processingTime'
      )
    );

    expect(config.data[0].y).toEqual([2.5]);
    expect(config.data[1].y).toEqual([3]);
    expect(config.data[2].y).toEqual([2]);
    expect(config.data[0].name).toBe('Average (days)');
    expect(config.data[1].name).toBe('Upper range (+1 std)');
    expect(config.data[2].name).toBe('Lower range (-1 std)');
    expect(config.data[0].mode).toBe('lines+markers');
    expect(config.layout.xaxis.title.text).toBe('Completed date');
    expect(config.layout.xaxis.automargin).toBe(true);
    expect(config.layout.yaxis.title.text).toBe('Days');
    expect(config.layout.yaxis.fixedrange).toBe(true);
    expect(config.layout.yaxis.rangemode).toBe('tozero');
  });

  test('buildTimelineChart preserves stacked values and colors', () => {
    const config = JSON.parse(
      buildTimelineChart([
        { date: '2024-02-01', completed: 5, withinDue: 4, beyondDue: 1 },
        { date: '2024-02-02', completed: 2, withinDue: 1, beyondDue: 1 },
      ])
    );

    expect(config.data[0].y).toEqual([4, 1]);
    expect(config.data[1].y).toEqual([1, 1]);
    expect(config.data[0].marker.color).toBe(chartColors.blue);
    expect(config.data[1].marker.color).toBe(chartColors.grey);
    expect(config.data[2].line.color).toBe(chartColors.signalRed);
    expect(config.data[2].line.width).toBe(3);
  });

  test('buildCompletedByNameChart supports empty series', () => {
    const config = JSON.parse(buildCompletedByNameChart([]));

    expect(config.data[0].x).toEqual([]);
    expect(config.data[1].x).toEqual([]);
    expect(config.layout.yaxis.categoryarray).toEqual([]);
  });

  test('buildHandlingChart clamps negative error ranges to zero', () => {
    const config = JSON.parse(
      buildHandlingChart({ metric: 'handlingTime', averageDays: 2, lowerRange: 5, upperRange: 1 })
    );

    expect(config.data[0].error_y.array).toEqual([0]);
    expect(config.data[0].error_y.arrayminus).toEqual([0]);
  });

  test('buildProcessingHandlingTimeChart uses handling metric and lower bound clamp', () => {
    const config = JSON.parse(
      buildProcessingHandlingTimeChart(
        [
          {
            date: '2024-03-01',
            tasks: 1,
            handlingAverageDays: 1,
            handlingStdDevDays: 3,
            handlingSumDays: 1,
            handlingCount: 1,
            processingAverageDays: 4,
            processingStdDevDays: 1,
            processingSumDays: 4,
            processingCount: 1,
          },
        ],
        'handlingTime'
      )
    );

    expect(config.data[0].y).toEqual([1]);
    expect(config.data[1].y).toEqual([4]);
    expect(config.data[2].y).toEqual([0]);
    expect(config.data[0].line.width).toBe(3);
    expect(config.data[1].line.width).toBe(2);
    expect(config.data[2].line.width).toBe(2);
    expect(config.layout.margin.b).toBe(60);
  });
});
