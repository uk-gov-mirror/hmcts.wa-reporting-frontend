import {
  buildLineTimeSeries,
  buildStackedBarTimeSeries,
  buildStackedBarWithLineTimeSeries,
} from '../../../../../main/modules/analytics/shared/charts/timeSeries';

describe('time series chart builders', () => {
  test('builds stacked bar charts with layout overrides', () => {
    const chart = buildStackedBarTimeSeries(['2024-01-01'], [{ name: 'Open', values: [3], color: '#0b0c0c' }], {
      layoutOverrides: { yaxis: { range: [0, 10] } },
      legendOrientation: 'v',
    });
    const parsed = JSON.parse(chart);

    expect(parsed.data[0].type).toBe('bar');
    expect(parsed.layout.legend.orientation).toBe('v');
    expect(parsed.layout.legend.traceorder).toBe('normal');
    expect(parsed.layout.yaxis.range).toEqual([0, 10]);
  });

  test('applies shared axis titles to stacked bar charts', () => {
    const chart = buildStackedBarTimeSeries(['2024-01-01'], [{ name: 'Open', values: [3], color: '#0b0c0c' }], {
      axisTitles: { x: 'Due date', y: 'Tasks' },
    });
    const parsed = JSON.parse(chart);

    expect(parsed.layout.xaxis.title.text).toBe('Due date');
    expect(parsed.layout.yaxis.title.text).toBe('Tasks');
  });

  test('builds stacked bar with line series', () => {
    const chart = buildStackedBarWithLineTimeSeries(
      ['2024-01-01', '2024-01-02'],
      [{ name: 'Open', values: [2, 3], color: '#0b0c0c' }],
      { name: 'Average', values: [1, 2], color: '#1d70b8', mode: 'lines', width: 2, axis: 'y2' }
    );
    const parsed = JSON.parse(chart);

    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[1].type).toBe('scatter');
    expect(parsed.data[1].mode).toBe('lines');
    expect(parsed.data[1].yaxis).toBe('y2');
  });

  test('uses default line mode when none is supplied', () => {
    const chart = buildStackedBarWithLineTimeSeries(['2024-01-01'], [{ name: 'Open', values: [1], color: '#0b0c0c' }], {
      values: [1],
      color: '#1d70b8',
    });
    const parsed = JSON.parse(chart);

    expect(parsed.data[1].mode).toBe('lines');
  });

  test('builds line series with default markers', () => {
    const chart = buildLineTimeSeries(['2024-01-01'], [{ name: 'Completed', values: [5], color: '#00703c' }], {
      layoutOverrides: { margin: { t: 10 } },
    });
    const parsed = JSON.parse(chart);

    expect(parsed.data[0].type).toBe('scatter');
    expect(parsed.data[0].mode).toBe('lines+markers');
    expect(parsed.layout.margin.t).toBe(10);
  });

  test('builds line series with explicit line mode', () => {
    const chart = buildLineTimeSeries(
      ['2024-01-01'],
      [{ name: 'Assigned', values: [2], color: '#1d70b8', mode: 'lines' }]
    );
    const parsed = JSON.parse(chart);

    expect(parsed.data[0].mode).toBe('lines');
  });

  test('applies shared axis titles to line charts while preserving overrides', () => {
    const chart = buildLineTimeSeries(['2024-01-01'], [{ name: 'Average', values: [2], color: '#1d70b8' }], {
      axisTitles: { x: 'Assigned date', y: 'Days' },
      layoutOverrides: { yaxis: { fixedrange: true } },
    });
    const parsed = JSON.parse(chart);

    expect(parsed.layout.xaxis.title.text).toBe('Assigned date');
    expect(parsed.layout.yaxis.title.text).toBe('Days');
    expect(parsed.layout.yaxis.fixedrange).toBe(true);
  });

  test('normalises string axis title overrides into title objects', () => {
    const chart = buildLineTimeSeries(['2024-01-01'], [{ name: 'Average', values: [2], color: '#1d70b8' }], {
      layoutOverrides: { yaxis: { title: 'Days' } },
    });
    const parsed = JSON.parse(chart);

    expect(parsed.layout.yaxis.title.text).toBe('Days');
  });
});
