import {
  buildUserCompletedByDateChart,
  buildUserCompletedComplianceChart,
  buildUserPriorityChart,
} from '../../../../main/modules/analytics/userOverview/visuals/charts';
import { chartColors } from '../../../../main/modules/analytics/shared/charts/colors';

describe('userOverviewCharts', () => {
  test('buildUserPriorityChart uses summary values', () => {
    const config = JSON.parse(buildUserPriorityChart({ urgent: 1, high: 2, medium: 3, low: 4 }));
    expect(config.data[0].values).toEqual([1, 2, 3, 4]);
    expect(config.data[0].labels).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(config.data[0].marker.colors).toEqual([
      chartColors.purple,
      chartColors.blueDark,
      chartColors.blueLight,
      chartColors.greyLight,
    ]);
    expect(config.data[0].type).toBe('pie');
  });

  test('buildUserCompletedByDateChart uses date series', () => {
    const config = JSON.parse(
      buildUserCompletedByDateChart([
        {
          date: '2024-01-01',
          tasks: 3,
          withinDue: 2,
          beyondDue: 1,
          handlingTimeSum: 6,
          handlingTimeCount: 2,
        },
      ])
    );
    expect(config.data[0].x).toEqual(['2024-01-01']);
    expect(config.data[0].name).toBe('Within due date');
    expect(config.data[1].name).toBe('Outside due date');
    expect(config.data[0].y).toEqual([2]);
    expect(config.data[1].y).toEqual([1]);
    expect(config.data[2].y).toEqual([3]);
    expect(config.data[2].name).toBe('Average handling time (days)');
    expect(config.data[2].yaxis).toBe('y2');
    expect(config.layout.xaxis.title.text).toBe('Completed date');
    expect(config.layout.yaxis.title.text).toBe('Tasks');
    expect(config.layout.yaxis.fixedrange).toBe(true);
    expect(config.layout.yaxis2.title.text).toBe('Average handling time (days)');
    expect(config.layout.yaxis2.overlaying).toBe('y');
    expect(config.layout.yaxis2.side).toBe('right');
    expect(config.layout.yaxis2.fixedrange).toBe(true);
    expect(config.layout.yaxis2.rangemode).toBe('tozero');
  });

  test('buildUserCompletedComplianceChart uses summary values', () => {
    const config = JSON.parse(buildUserCompletedComplianceChart({ withinDueYes: 3, withinDueNo: 1 }));
    expect(config.data[0].values).toEqual([3, 1]);
    expect(config.data[0].labels).toEqual(['Within due date', 'Beyond due date']);
    expect(config.data[0].marker.colors).toEqual([chartColors.blue, chartColors.grey]);
  });

  test('buildUserCompletedByDateChart falls back to zero averages when count is zero', () => {
    const config = JSON.parse(
      buildUserCompletedByDateChart([
        {
          date: '2024-02-01',
          tasks: 2,
          withinDue: 1,
          beyondDue: 1,
          handlingTimeSum: 0,
          handlingTimeCount: 0,
        },
      ])
    );

    expect(config.data[2].y).toEqual([0]);
    expect(config.data[2].line.width).toBe(2);
    expect(config.data[2].line.color).toBe(chartColors.signalRed);
    expect(config.layout.yaxis.rangemode).toBe('tozero');
    expect(config.layout.yaxis2.rangemode).toBe('tozero');
  });

  test('buildUserPriorityChart supports zeroed summaries', () => {
    const config = JSON.parse(buildUserPriorityChart({ urgent: 0, high: 0, medium: 0, low: 0 }));

    expect(config.data[0].values).toEqual([0, 0, 0, 0]);
    expect(config.data[0].labels).toEqual(['Urgent', 'High', 'Medium', 'Low']);
  });
});
