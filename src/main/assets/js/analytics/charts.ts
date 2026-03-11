import type { Config } from 'plotly.js';
import Plotly from 'plotly.js-basic-dist-min';

import type { PlotlyConfig } from './types';

const baseLayout = {
  autosize: true,
  margin: { t: 0, r: 0, b: 0, l: 0, pad: 0 },
  xaxis: { automargin: true },
  yaxis: { automargin: true },
};

const baseChartConfig: Partial<Config> = {
  displaylogo: false,
  displayModeBar: true,
  responsive: true,
  scrollZoom: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
};

type PlotlyGraphNode = HTMLElement & {
  _fullLayout?: { yaxis?: { range?: [number, number] } };
  on?: (event: string, handler: () => void) => void;
  removeListener?: (event: string, handler: () => void) => void;
  removeAllListeners?: (event: string) => void;
};

type ScrollPanState = {
  track: HTMLDivElement;
  handle: HTMLDivElement;
  categoryCount: number;
  relayoutHandler: (() => void) | null;
};

const scrollPanStateByNode = new WeakMap<HTMLElement, ScrollPanState>();

function updateScrollHandle(node: HTMLElement, state: ScrollPanState): void {
  const graph = node as PlotlyGraphNode;
  const range = graph._fullLayout?.yaxis?.range;
  if (!range || state.categoryCount <= 0) {
    state.track.style.display = 'none';
    return;
  }

  const windowSize = range[0] - range[1];
  const min = -0.5;
  const max = state.categoryCount - 0.5;
  const totalSpan = max - min;
  const availableSpan = totalSpan - windowSize;
  if (availableSpan <= 0) {
    state.track.style.display = 'none';
    return;
  }

  state.track.style.display = '';
  const trackHeight = state.track.getBoundingClientRect().height;
  const handleHeight = Math.max(24, (windowSize / totalSpan) * trackHeight);
  const position = (range[0] - (min + windowSize)) / availableSpan;
  const top = Math.min(trackHeight - handleHeight, Math.max(0, position * (trackHeight - handleHeight)));
  state.handle.style.height = `${handleHeight}px`;
  state.handle.style.top = `${top}px`;
}

export function labelModebarButtons(container: HTMLElement): void {
  const buttons = container.querySelectorAll<HTMLAnchorElement>('.modebar-btn');
  buttons.forEach(button => {
    if (button.getAttribute('aria-label') || button.getAttribute('title')) {
      return;
    }
    const label = button.getAttribute('data-title') || button.getAttribute('title');
    if (label) {
      button.setAttribute('title', label);
      button.setAttribute('aria-label', label);
    }
  });
}

export function renderCharts(): void {
  const nodes = document.querySelectorAll<HTMLElement>('[data-chart-config]');
  nodes.forEach(node => {
    const raw = node.dataset.chartConfig;
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PlotlyConfig;
      const parsedConfig = parsed.config ?? {};
      const parsedLayout = parsed.layout ?? {};
      const layout = {
        ...baseLayout,
        ...parsedLayout,
        margin: { ...baseLayout.margin, ...(parsedLayout.margin ?? {}) },
      };
      Plotly.newPlot(node, parsed.data, layout, { ...baseChartConfig, ...parsedConfig }).then(() => {
        labelModebarButtons(node);
      });
      if (node.dataset.scrollPan === 'true') {
        bindScrollPan(node, parsed);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to render chart', error);
    }
  });
}

export function renderOpenByNameChart(node: HTMLElement, config: PlotlyConfig): void {
  const parsedLayout = config.layout ?? {};
  const layout = {
    ...baseLayout,
    ...parsedLayout,
    margin: { ...baseLayout.margin, ...(parsedLayout.margin ?? {}) },
  };
  Plotly.newPlot(node, config.data, layout, { ...baseChartConfig, ...(config.config ?? {}) });
  bindScrollPan(node, config);
}

export function bindScrollPan(node: HTMLElement, config: PlotlyConfig): void {
  const categories = (config.data?.[0] as { y?: unknown })?.y;
  const categoryCount = Array.isArray(categories) ? categories.length : 0;

  let state = scrollPanStateByNode.get(node);
  if (!state && categoryCount <= 0) {
    return;
  }

  if (!state) {
    const track = document.createElement('div');
    track.className = 'analytics-chart-scroll-track';
    const handle = document.createElement('div');
    handle.className = 'analytics-chart-scroll-handle';
    track.appendChild(handle);
    node.appendChild(track);

    const newState: ScrollPanState = {
      track,
      handle,
      categoryCount,
      relayoutHandler: null,
    };
    scrollPanStateByNode.set(node, newState);
    state = newState;

    let dragOffset = 0;
    let pendingDragTop: number | null = null;
    let dragRafId: number | null = null;
    const applyDragMove = () => {
      dragRafId = null;
      const graph = node as PlotlyGraphNode;
      const range = graph._fullLayout?.yaxis?.range;
      if (!range || pendingDragTop === null) {
        pendingDragTop = null;
        return;
      }
      const rect = newState.track.getBoundingClientRect();
      const windowSize = range[0] - range[1];
      const min = -0.5;
      const max = newState.categoryCount - 0.5;
      const totalSpan = max - min;
      const availableSpan = totalSpan - windowSize;
      if (availableSpan <= 0) {
        pendingDragTop = null;
        return;
      }
      const trackHeight = rect.height;
      const handleHeight = Math.max(24, (windowSize / totalSpan) * trackHeight);
      const clampedTop = Math.min(trackHeight - handleHeight, Math.max(0, pendingDragTop));
      pendingDragTop = null;
      const position = clampedTop / (trackHeight - handleHeight);
      const nextLower = min + availableSpan * position;
      const nextUpper = nextLower + windowSize;
      void Plotly.relayout(node, { 'yaxis.range': [nextUpper, nextLower] }).then(() =>
        updateScrollHandle(node, newState)
      );
    };

    const onDragMove = (event: MouseEvent) => {
      const rect = newState.track.getBoundingClientRect();
      pendingDragTop = event.clientY - rect.top - dragOffset;
      if (dragRafId === null) {
        dragRafId = window.requestAnimationFrame(applyDragMove);
      }
    };

    const onDragEnd = () => {
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      pendingDragTop = null;
      if (dragRafId !== null) {
        window.cancelAnimationFrame(dragRafId);
        dragRafId = null;
      }
    };

    newState.handle.addEventListener('mousedown', event => {
      event.preventDefault();
      const rect = newState.handle.getBoundingClientRect();
      dragOffset = event.clientY - rect.top;
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd);
    });

    let pendingStep = 0;
    let rafId: number | null = null;
    const applyWheelStep = () => {
      rafId = null;
      const graph = node as PlotlyGraphNode;
      const range = graph._fullLayout?.yaxis?.range;
      if (!range || pendingStep === 0) {
        pendingStep = 0;
        return;
      }
      const step = pendingStep;
      pendingStep = 0;
      const windowSize = range[0] - range[1];
      const min = -0.5;
      const max = newState.categoryCount - 0.5;
      const nextUpper = Math.min(max, Math.max(min + windowSize, range[0] + step));
      const nextLower = nextUpper - windowSize;
      void Plotly.relayout(node, { 'yaxis.range': [nextUpper, nextLower] }).then(() =>
        updateScrollHandle(node, newState)
      );
    };

    node.addEventListener(
      'wheel',
      event => {
        if (event.deltaY === 0) {
          return;
        }
        event.preventDefault();
        pendingStep += Math.sign(event.deltaY) * 3;
        if (rafId === null) {
          rafId = window.requestAnimationFrame(applyWheelStep);
        }
      },
      { passive: false }
    );

    node.dataset.scrollPanBound = 'true';
  }

  state.categoryCount = categoryCount;

  const plotlyNode = node as PlotlyGraphNode;
  if (state.relayoutHandler) {
    if (plotlyNode.removeAllListeners) {
      plotlyNode.removeAllListeners('plotly_relayout');
    } else if (plotlyNode.removeListener) {
      plotlyNode.removeListener('plotly_relayout', state.relayoutHandler);
    }
  }

  state.relayoutHandler = () => updateScrollHandle(node, state);
  plotlyNode.on?.('plotly_relayout', state.relayoutHandler);

  updateScrollHandle(node, state);
}
