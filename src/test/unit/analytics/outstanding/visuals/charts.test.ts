import {
  buildAssignmentDonutChart,
  buildOpenByNameChartConfig,
  buildOpenTasksChart,
  buildPriorityDonutChart,
  buildTasksDueChart,
  buildTasksDuePriorityChart,
  buildWaitTimeChart,
} from '../../../../../main/modules/analytics/outstanding/visuals/charts';
import { chartColors } from '../../../../../main/modules/analytics/shared/charts/colors';
import { PriorityBreakdown } from '../../../../../main/modules/analytics/shared/types';

describe('outstanding charts', () => {
  test('buildOpenByNameChartConfig sorts by urgent then total', () => {
    const breakdown: PriorityBreakdown[] = [
      { name: 'Task B', urgent: 1, high: 1, medium: 0, low: 0 },
      { name: 'Task A', urgent: 2, high: 0, medium: 0, low: 0 },
      { name: 'Task C', urgent: 1, high: 0, medium: 0, low: 0 },
    ];

    const config = buildOpenByNameChartConfig(breakdown) as {
      data: { name: string }[];
      layout: { yaxis: { categoryarray: string[] }; legend: { traceorder: string } };
    };

    expect(config.layout.yaxis.categoryarray).toEqual(['Task A', 'Task B', 'Task C']);
    expect(config.data.map(series => series.name)).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(config.layout.legend.traceorder).toBe('normal');
  });

  test('buildOpenTasksChart returns plotly config', () => {
    const chart = buildOpenTasksChart([
      { date: '2024-01-01', open: 4, assigned: 3, unassigned: 1, assignedPct: 75, unassignedPct: 25 },
    ]);

    const parsed = JSON.parse(chart) as {
      data: { x: string[]; y: number[]; name: string }[];
      layout: { xaxis: { title: { text: string } }; yaxis: { title: { text: string } } };
    };

    expect(parsed.data[0].name).toBe('Assigned');
    expect(parsed.data[0].x).toEqual(['2024-01-01']);
    expect(parsed.data[0].y).toEqual([3]);
    expect(parsed.layout.xaxis.title.text).toBe('Created date');
    expect(parsed.layout.yaxis.title.text).toBe('Tasks');
  });

  test('buildWaitTimeChart returns plotly config', () => {
    const chart = buildWaitTimeChart([
      { date: '2024-01-01', averageWaitDays: 2.5, assignedCount: 2, totalWaitDays: 5 },
    ]);

    const parsed = JSON.parse(chart) as {
      data: { x: string[]; y: number[]; name: string }[];
      layout: { xaxis: { title: { text: string } }; yaxis: { title: { text: string } } };
    };

    expect(parsed.data[0].name).toBe('Average wait (days)');
    expect(parsed.data[0].x).toEqual(['2024-01-01']);
    expect(parsed.data[0].y).toEqual([2.5]);
    expect(parsed.layout.xaxis.title.text).toBe('Assigned date');
    expect(parsed.layout.yaxis.title.text).toBe('Days');
  });

  test('buildTasksDueChart returns plotly config', () => {
    const chart = buildTasksDueChart([{ date: '2024-01-01', open: 2, completed: 1, totalDue: 3 }]);

    const parsed = JSON.parse(chart) as {
      data: { name: string; y: number[] }[];
      layout: { xaxis: { title: { text: string } }; yaxis: { title: { text: string } } };
    };

    expect(parsed.data.map(series => series.name)).toEqual(['Open', 'Completed']);
    expect(parsed.data[0].y).toEqual([2]);
    expect(parsed.layout.xaxis.title.text).toBe('Due date');
    expect(parsed.layout.yaxis.title.text).toBe('Tasks');
  });

  test('buildTasksDuePriorityChart returns plotly config', () => {
    const chart = buildTasksDuePriorityChart([{ date: '2024-01-01', urgent: 1, high: 2, medium: 0, low: 1 }]);

    const parsed = JSON.parse(chart) as {
      data: { name: string; y: number[]; marker: { color: string } }[];
      layout: { xaxis: { title: { text: string } }; yaxis: { title: { text: string } } };
    };

    expect(parsed.data.map(series => series.name)).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(parsed.data[1].y).toEqual([2]);
    expect(parsed.data.map(series => series.marker.color)).toEqual([
      chartColors.purple,
      chartColors.blueDark,
      chartColors.blueLight,
      chartColors.greyLight,
    ]);
    expect(parsed.layout.xaxis.title.text).toBe('Due date');
    expect(parsed.layout.yaxis.title.text).toBe('Tasks');
  });

  test('buildPriorityDonutChart builds chart slices', () => {
    const chart = buildPriorityDonutChart({ urgent: 1, high: 2, medium: 3, low: 4 });
    const parsed = JSON.parse(chart) as {
      data: { values: number[]; labels: string[]; marker: { colors: string[] } }[];
    };

    expect(parsed.data[0].labels).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(parsed.data[0].values).toEqual([1, 2, 3, 4]);
    expect(parsed.data[0].marker.colors).toEqual([
      chartColors.purple,
      chartColors.blueDark,
      chartColors.blueLight,
      chartColors.greyLight,
    ]);
  });

  test('buildAssignmentDonutChart builds assigned/unassigned chart', () => {
    const chart = buildAssignmentDonutChart({ assigned: 5, unassigned: 2 });
    const parsed = JSON.parse(chart) as { data: { values: number[]; labels: string[] }[] };

    expect(parsed.data[0].labels).toEqual(['Assigned', 'Unassigned']);
    expect(parsed.data[0].values).toEqual([5, 2]);
  });
});
