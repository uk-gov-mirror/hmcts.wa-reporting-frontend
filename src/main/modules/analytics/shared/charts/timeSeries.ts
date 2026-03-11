import { buildChartConfig } from './plotly';

type BarSeries = {
  name: string;
  values: number[];
  color: string;
};

type LineSeries = {
  name?: string;
  values: number[];
  color: string;
  mode?: 'lines' | 'lines+markers';
  width?: number;
  axis?: 'y' | 'y2';
};

type AxisTitles = {
  x?: string;
  y?: string;
};

type TimeSeriesLayoutOverrides = {
  layoutOverrides?: Record<string, unknown>;
  legendOrientation?: 'h' | 'v';
  axisTitles?: AxisTitles;
};

const defaultDateXAxis = {
  type: 'date',
  tickformat: '%-d %b %Y',
  hoverformat: '%-d %b %Y',
  automargin: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function withNormalisedAxisTitle(axis: Record<string, unknown>): Record<string, unknown> {
  const title = axis.title;
  if (typeof title === 'string') {
    return { ...axis, title: { text: title } };
  }
  return axis;
}

function buildTimeSeriesAxes(
  layoutOverrides: Record<string, unknown>,
  axisTitles: AxisTitles | undefined,
  defaultYaxis: Record<string, unknown>
): {
  restLayout: Record<string, unknown>;
  xaxis: Record<string, unknown>;
  yaxis: Record<string, unknown>;
} {
  const { xaxis: rawXaxisOverrides, yaxis: rawYaxisOverrides, ...restLayout } = layoutOverrides;
  const xaxisOverrides = withNormalisedAxisTitle(isRecord(rawXaxisOverrides) ? rawXaxisOverrides : {});
  const yaxisOverrides = withNormalisedAxisTitle(isRecord(rawYaxisOverrides) ? rawYaxisOverrides : {});

  return {
    restLayout,
    xaxis: {
      ...defaultDateXAxis,
      ...(axisTitles?.x ? { title: { text: axisTitles.x } } : {}),
      ...xaxisOverrides,
    },
    yaxis: {
      ...defaultYaxis,
      ...(axisTitles?.y ? { title: { text: axisTitles.y } } : {}),
      ...yaxisOverrides,
    },
  };
}

export function buildStackedBarTimeSeries(
  dates: string[],
  series: BarSeries[],
  { layoutOverrides = {}, legendOrientation = 'h', axisTitles }: TimeSeriesLayoutOverrides = {}
): string {
  const { restLayout, xaxis, yaxis } = buildTimeSeriesAxes(layoutOverrides, axisTitles, {
    automargin: true,
    fixedrange: true,
    rangemode: 'tozero',
  });

  return buildChartConfig({
    data: series.map(item => ({
      x: dates,
      y: item.values,
      type: 'bar',
      name: item.name,
      marker: { color: item.color },
    })),
    layout: {
      barmode: 'stack',
      margin: { t: 20 },
      legend: { orientation: legendOrientation, traceorder: 'normal' },
      ...restLayout,
      xaxis,
      yaxis,
    },
  });
}

export function buildStackedBarWithLineTimeSeries(
  dates: string[],
  bars: BarSeries[],
  line: LineSeries,
  { layoutOverrides = {}, legendOrientation = 'h', axisTitles }: TimeSeriesLayoutOverrides = {}
): string {
  const { restLayout, xaxis, yaxis } = buildTimeSeriesAxes(layoutOverrides, axisTitles, {
    automargin: true,
    fixedrange: true,
    rangemode: 'tozero',
  });

  return buildChartConfig({
    data: [
      ...bars.map(item => ({
        x: dates,
        y: item.values,
        type: 'bar',
        name: item.name,
        marker: { color: item.color },
      })),
      {
        x: dates,
        y: line.values,
        type: 'scatter',
        mode: line.mode ?? 'lines',
        name: line.name,
        line: { color: line.color, width: line.width },
        yaxis: line.axis,
      },
    ],
    layout: {
      barmode: 'stack',
      margin: { t: 20 },
      legend: { orientation: legendOrientation, traceorder: 'normal' },
      ...restLayout,
      xaxis,
      yaxis,
    },
  });
}

export function buildLineTimeSeries(
  dates: string[],
  series: LineSeries[],
  { layoutOverrides = {}, axisTitles }: Pick<TimeSeriesLayoutOverrides, 'layoutOverrides' | 'axisTitles'> = {}
): string {
  const { restLayout, xaxis, yaxis } = buildTimeSeriesAxes(layoutOverrides, axisTitles, {});

  return buildChartConfig({
    data: series.map(item => ({
      x: dates,
      y: item.values,
      type: 'scatter',
      mode: item.mode ?? 'lines+markers',
      name: item.name,
      line: { color: item.color, width: item.width },
    })),
    layout: {
      margin: { t: 20 },
      ...restLayout,
      xaxis,
      ...(Object.keys(yaxis).length > 0 ? { yaxis } : {}),
    },
  });
}
