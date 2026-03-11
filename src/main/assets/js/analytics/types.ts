export type PlotlyData = Record<string, unknown>;

export type PlotlyConfig = {
  data: PlotlyData[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
};
