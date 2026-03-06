export type PlotlyData = Record<string, unknown>;

export type PlotlyAutoFitAxisRule = {
  axis: 'y' | 'y2';
  strategy: 'stacked-bar-sum' | 'stacked-bar-and-line-max' | 'line-extents';
  paddingRatio?: number;
  minUpperBound?: number;
};

export type PlotlyConfig = {
  data: PlotlyData[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
  behaviors?: {
    autoFitYAxesOnXZoom?: PlotlyAutoFitAxisRule[];
  };
};
