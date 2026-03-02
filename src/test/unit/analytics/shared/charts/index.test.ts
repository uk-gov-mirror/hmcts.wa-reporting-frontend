import * as charts from '../../../../../main/modules/analytics/shared/charts';
import { chartColors } from '../../../../../main/modules/analytics/shared/charts/colors';
import { buildDonutChart } from '../../../../../main/modules/analytics/shared/charts/donut';
import { buildChartConfig } from '../../../../../main/modules/analytics/shared/charts/plotly';
import { buildStackedHorizontalBarChart } from '../../../../../main/modules/analytics/shared/charts/stackedHorizontalBar';

describe('charts index', () => {
  test('re-exports chart helpers from source modules', () => {
    expect(charts.buildChartConfig).toBe(buildChartConfig);
    expect(charts.buildDonutChart).toBe(buildDonutChart);
    expect(charts.buildStackedHorizontalBarChart).toBe(buildStackedHorizontalBarChart);
    expect(charts.chartColors).toBe(chartColors);
  });
});
