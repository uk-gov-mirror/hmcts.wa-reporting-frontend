/* @jest-environment jsdom */
import Plotly from 'plotly.js-basic-dist-min';

import {
  bindAutoFitYAxesOnXZoom,
  bindScrollPan,
  labelModebarButtons,
  renderCharts,
  renderOpenByNameChart,
} from '../../../../main/assets/js/analytics/charts';

import { mockBoundingClientRect, setupAnalyticsDom } from './analyticsTestUtils';

jest.mock('plotly.js-basic-dist-min', () => ({
  __esModule: true,
  default: {
    newPlot: jest.fn(() => Promise.resolve()),
    relayout: jest.fn(() => Promise.resolve()),
  },
}));

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const escapeHtmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

describe('analytics charts', () => {
  const originalBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeAll(() => {
    HTMLElement.prototype.getBoundingClientRect = mockBoundingClientRect;
  });

  afterAll(() => {
    HTMLElement.prototype.getBoundingClientRect = originalBoundingClientRect;
  });

  beforeEach(() => {
    setupAnalyticsDom();
  });

  test('renders charts and labels modebar buttons', async () => {
    const chartNode = document.createElement('div');
    const onSpy = jest.fn();
    chartNode.dataset.chartConfig = JSON.stringify({
      data: [{ y: ['A', 'B'] }],
      layout: { margin: { l: 10 } },
      behaviors: {
        autoFitYAxesOnXZoom: [{ axis: 'y', strategy: 'line-extents', paddingRatio: 0.05, minUpperBound: 1 }],
      },
    });
    chartNode.dataset.scrollPan = 'true';
    (chartNode as unknown as { _fullLayout?: { yaxis?: { range?: [number, number] } } })._fullLayout = {
      yaxis: { range: [4, 0] },
    };
    (chartNode as unknown as { on?: (event: string, handler: (eventData?: unknown) => void) => void }).on = onSpy;
    const modebar = document.createElement('a');
    modebar.className = 'modebar-btn';
    modebar.dataset.title = 'Download plot';
    chartNode.appendChild(modebar);
    const labeledModebar = document.createElement('a');
    labeledModebar.className = 'modebar-btn';
    labeledModebar.setAttribute('title', 'Already labeled');
    chartNode.appendChild(labeledModebar);
    document.body.appendChild(chartNode);

    const invalidNode = document.createElement('div');
    invalidNode.dataset.chartConfig = '{invalid';
    document.body.appendChild(invalidNode);
    const emptyNode = document.createElement('div');
    emptyNode.dataset.chartConfig = '';
    document.body.appendChild(emptyNode);
    const staticNode = document.createElement('div');
    staticNode.dataset.chartConfig = JSON.stringify({
      data: [{ y: ['X'] }],
      config: { displayModeBar: false },
    });
    document.body.appendChild(staticNode);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderCharts();
    await flushPromises();

    expect(Plotly.newPlot).toHaveBeenCalled();
    expect(modebar.getAttribute('aria-label')).toBe('Download plot');
    expect(chartNode.dataset.scrollPanBound).toBe('true');
    expect(onSpy).toHaveBeenCalledWith('plotly_relayout', expect.any(Function));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('auto-fits stacked-bar y ranges when the visible x window narrows', () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: {
        xaxis?: { range?: [unknown, unknown]; autorange?: boolean };
        yaxis?: { range?: [number, number]; autorange?: boolean };
      };
      on?: (event: string, handler: (eventData?: unknown) => void) => void;
    };

    plotlyNode._fullLayout = {
      xaxis: { range: ['2024-01-01', '2024-01-02'], autorange: false },
      yaxis: { range: [0, 20], autorange: false },
    };

    let relayoutHandler: ((eventData?: unknown) => void) | undefined;
    plotlyNode.on = jest.fn((_event: string, handler: (eventData?: unknown) => void) => {
      relayoutHandler = handler;
    });

    bindAutoFitYAxesOnXZoom(node, {
      data: [
        { type: 'bar', x: ['2024-01-01', '2024-01-02', '2024-01-03'], y: [1, 2, 10] },
        { type: 'bar', x: ['2024-01-01', '2024-01-02', '2024-01-03'], y: [0, 1, 5] },
      ],
      behaviors: {
        autoFitYAxesOnXZoom: [{ axis: 'y', strategy: 'stacked-bar-sum', paddingRatio: 0.05, minUpperBound: 1 }],
      },
    });

    relayoutHandler?.({ 'xaxis.range[0]': '2024-01-01', 'xaxis.range[1]': '2024-01-02' });

    expect(Plotly.relayout).toHaveBeenCalledWith(node, {
      'yaxis.autorange': false,
      'yaxis.range': [0, 3.1500000000000004],
    });
  });

  test('auto-fits line-only charts and ignores charts without auto-fit metadata', () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: {
        xaxis?: { range?: [unknown, unknown]; autorange?: boolean };
        yaxis?: { range?: [number, number]; autorange?: boolean };
      };
      on?: (event: string, handler: (eventData?: unknown) => void) => void;
    };

    plotlyNode._fullLayout = {
      xaxis: { range: ['2024-01-01', '2024-01-02'], autorange: false },
      yaxis: { range: [0, 20], autorange: false },
    };

    let relayoutHandler: ((eventData?: unknown) => void) | undefined;
    plotlyNode.on = jest.fn((_event: string, handler: (eventData?: unknown) => void) => {
      relayoutHandler = handler;
    });

    bindAutoFitYAxesOnXZoom(node, {
      data: [
        { type: 'scatter', x: ['2024-01-01', '2024-01-02', '2024-01-03'], y: [1, 3, 12] },
        { type: 'scatter', x: ['2024-01-01', '2024-01-02', '2024-01-03'], y: [2, 4, 10] },
      ],
      behaviors: {
        autoFitYAxesOnXZoom: [{ axis: 'y', strategy: 'line-extents', paddingRatio: 0.05, minUpperBound: 1 }],
      },
    });

    relayoutHandler?.({ 'xaxis.range[0]': '2024-01-01', 'xaxis.range[1]': '2024-01-02' });

    expect(Plotly.relayout).toHaveBeenLastCalledWith(node, {
      'yaxis.autorange': false,
      'yaxis.range': [0, 4.2],
    });

    (Plotly.relayout as jest.Mock).mockClear();
    bindAutoFitYAxesOnXZoom(document.createElement('div'), { data: [{ type: 'scatter', x: ['2024-01-01'], y: [1] }] });
    expect(Plotly.relayout).not.toHaveBeenCalled();
  });

  test('auto-fits mixed trace data with reversed numeric x ranges', () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: {
        xaxis?: { range?: [unknown, unknown]; autorange?: boolean };
        yaxis?: { range?: [number, number]; autorange?: boolean };
      };
      on?: (event: string, handler: (eventData?: unknown) => void) => void;
    };

    plotlyNode._fullLayout = {
      xaxis: { range: [2, 1], autorange: false },
      yaxis: { range: [0, 20], autorange: false },
    };

    let relayoutHandler: ((eventData?: unknown) => void) | undefined;
    plotlyNode.on = jest.fn((_event: string, handler: (eventData?: unknown) => void) => {
      relayoutHandler = handler;
    });

    bindAutoFitYAxesOnXZoom(node, {
      data: [
        { type: 'bar', x: [0, 1, '2', 'bad', 3], y: [100, '2', '', 4, -3] },
        { type: 'bar', x: [1, 2, 3], y: [1, '5', 2] },
        { type: 'scatter', x: [1, 2, 3], y: [3, '6', 1] },
      ],
      behaviors: {
        autoFitYAxesOnXZoom: [{ axis: 'y', strategy: 'stacked-bar-and-line-max', paddingRatio: 0.1, minUpperBound: 2 }],
      },
    });

    relayoutHandler?.();

    expect(Plotly.relayout).toHaveBeenCalledWith(node, {
      'yaxis.autorange': false,
      'yaxis.range': [0, 6.6000000000000005],
    });
  });

  test('auto-fits dual-axis charts and restores autorange on reset', async () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: {
        xaxis?: { range?: [unknown, unknown]; autorange?: boolean };
        yaxis?: { range?: [number, number]; autorange?: boolean };
        yaxis2?: { range?: [number, number]; autorange?: boolean };
      };
      on?: (event: string, handler: (eventData?: unknown) => void) => void;
    };

    plotlyNode._fullLayout = {
      xaxis: { range: ['2024-01-01', '2024-01-02'], autorange: false },
      yaxis: { range: [0, 20], autorange: false },
      yaxis2: { range: [0, 20], autorange: false },
    };

    let relayoutHandler: ((eventData?: unknown) => void) | undefined;
    plotlyNode.on = jest.fn((_event: string, handler: (eventData?: unknown) => void) => {
      relayoutHandler = handler;
    });

    bindAutoFitYAxesOnXZoom(node, {
      data: [
        { type: 'bar', x: ['2024-01-01', '2024-01-02', '2024-01-03'], y: [1, 2, 10] },
        { type: 'bar', x: ['2024-01-01', '2024-01-02', '2024-01-03'], y: [0, 1, 4] },
        { type: 'scatter', x: ['2024-01-01', '2024-01-02', '2024-01-03'], y: [2, 4, 20], yaxis: 'y2' },
      ],
      behaviors: {
        autoFitYAxesOnXZoom: [
          { axis: 'y', strategy: 'stacked-bar-sum', paddingRatio: 0.05, minUpperBound: 1 },
          { axis: 'y2', strategy: 'line-extents', paddingRatio: 0.05, minUpperBound: 1 },
        ],
      },
    });

    relayoutHandler?.({ 'xaxis.range[0]': '2024-01-01', 'xaxis.range[1]': '2024-01-02' });
    await flushPromises();

    expect(Plotly.relayout).toHaveBeenLastCalledWith(node, {
      'yaxis.autorange': false,
      'yaxis.range': [0, 3.1500000000000004],
      'yaxis2.autorange': false,
      'yaxis2.range': [0, 4.2],
    });

    (Plotly.relayout as jest.Mock).mockClear();
    plotlyNode._fullLayout = {
      xaxis: { range: ['2024-01-01', '2024-01-03'], autorange: true },
      yaxis: { range: [0, 20], autorange: false },
      yaxis2: { range: [0, 20], autorange: false },
    };

    relayoutHandler?.({ 'xaxis.autorange': true });
    await flushPromises();

    expect(Plotly.relayout).toHaveBeenCalledWith(node, {
      'yaxis.autorange': true,
      'yaxis.range': null,
      'yaxis2.autorange': true,
      'yaxis2.range': null,
    });
  });

  test('ignores relayouts without x-axis changes or a usable x window', () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: {
        xaxis?: { range?: [unknown, unknown]; autorange?: boolean };
        yaxis?: { range?: [number, number]; autorange?: boolean };
      };
      on?: (event: string, handler: (eventData?: unknown) => void) => void;
    };

    plotlyNode._fullLayout = {
      xaxis: { autorange: false },
      yaxis: { range: [0, 20], autorange: false },
    };

    let relayoutHandler: ((eventData?: unknown) => void) | undefined;
    plotlyNode.on = jest.fn((_event: string, handler: (eventData?: unknown) => void) => {
      relayoutHandler = handler;
    });

    bindAutoFitYAxesOnXZoom(node, {
      data: [{ type: 'scatter', x: ['2024-01-01'], y: [1] }],
      behaviors: {
        autoFitYAxesOnXZoom: [{ axis: 'y', strategy: 'line-extents', paddingRatio: 0.05, minUpperBound: 1 }],
      },
    });

    (Plotly.relayout as jest.Mock).mockClear();
    relayoutHandler?.({ 'yaxis.range[0]': 0 });
    relayoutHandler?.({ 'xaxis.range[0]': '2024-01-01' });

    plotlyNode._fullLayout = {
      xaxis: { range: ['', 'not-a-date'], autorange: false },
      yaxis: { range: [0, 20], autorange: false },
    };
    relayoutHandler?.({ 'xaxis.range[0]': '2024-01-01' });

    expect(Plotly.relayout).not.toHaveBeenCalled();
  });

  test('falls back to the minimum upper bound for unsupported auto-fit strategies', () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: {
        xaxis?: { range?: [unknown, unknown]; autorange?: boolean };
        yaxis?: { range?: [number, number]; autorange?: boolean };
      };
      on?: (event: string, handler: (eventData?: unknown) => void) => void;
    };

    plotlyNode._fullLayout = {
      xaxis: { range: ['2024-01-01', '2024-01-02'], autorange: false },
      yaxis: { range: [0, 20], autorange: false },
    };

    let relayoutHandler: ((eventData?: unknown) => void) | undefined;
    plotlyNode.on = jest.fn((_event: string, handler: (eventData?: unknown) => void) => {
      relayoutHandler = handler;
    });

    bindAutoFitYAxesOnXZoom(node, {
      data: [{ type: 'scatter', x: ['2024-01-01', '2024-01-02'], y: [4, 5] }],
      behaviors: {
        autoFitYAxesOnXZoom: [
          {
            axis: 'y',
            strategy: 'unsupported' as unknown as 'line-extents',
            paddingRatio: 0,
            minUpperBound: 7,
          },
        ],
      },
    });

    relayoutHandler?.({ 'xaxis.range[0]': '2024-01-01' });

    expect(Plotly.relayout).toHaveBeenLastCalledWith(node, {
      'yaxis.autorange': false,
      'yaxis.range': [0, 7],
    });
  });

  test('uses default auto-fit options and ignores malformed trace point arrays', () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: {
        xaxis?: { range?: [unknown, unknown]; autorange?: boolean };
        yaxis?: { range?: [number, number]; autorange?: boolean };
      };
      on?: (event: string, handler: (eventData?: unknown) => void) => void;
    };

    plotlyNode._fullLayout = {
      xaxis: { range: [1, 2], autorange: false },
      yaxis: { range: [0, 20], autorange: false },
    };

    let relayoutHandler: ((eventData?: unknown) => void) | undefined;
    plotlyNode.on = jest.fn((_event: string, handler: (eventData?: unknown) => void) => {
      relayoutHandler = handler;
    });

    bindAutoFitYAxesOnXZoom(node, {
      data: [
        { type: 'scatter', x: 'not-an-array' as unknown as string[], y: [9, 10] },
        { type: 'scatter', x: [1, 2], y: 'not-an-array' as unknown as number[] },
        { type: 'scatter', x: [1, 2], y: ['not-a-number', '3'] },
      ],
      behaviors: {
        autoFitYAxesOnXZoom: [{ axis: 'y', strategy: 'line-extents' }],
      },
    });

    relayoutHandler?.({ 'xaxis.range[0]': 1 });

    expect(Plotly.relayout).toHaveBeenLastCalledWith(node, {
      'yaxis.autorange': false,
      'yaxis.range': [0, 3.1500000000000004],
    });
  });

  test('rebinds auto-fit listeners through removeListener and ignores nested relayout events', async () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: {
        xaxis?: { range?: [unknown, unknown]; autorange?: boolean };
        yaxis?: { range?: [number, number]; autorange?: boolean };
      };
      on?: (event: string, handler: (eventData?: unknown) => void) => void;
      removeListener?: (event: string, handler: (eventData?: unknown) => void) => void;
    };

    plotlyNode._fullLayout = {
      xaxis: { range: ['2024-01-01', '2024-01-02'], autorange: false },
      yaxis: { range: [0, 20], autorange: false },
    };

    let relayoutHandler: ((eventData?: unknown) => void) | undefined;
    let firstHandler: ((eventData?: unknown) => void) | undefined;
    const onSpy = jest.fn((_event: string, handler: (eventData?: unknown) => void) => {
      if (!firstHandler) {
        firstHandler = handler;
      }
      relayoutHandler = handler;
    });
    const removeListenerSpy = jest.fn();
    plotlyNode.on = onSpy;
    plotlyNode.removeListener = removeListenerSpy;

    let resolveRelayout: (() => void) | undefined;
    (Plotly.relayout as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveRelayout = resolve;
        })
    );

    bindAutoFitYAxesOnXZoom(node, {
      data: [{ type: 'scatter', x: ['2024-01-01', '2024-01-02'], y: [1, 2] }],
      behaviors: {
        autoFitYAxesOnXZoom: [{ axis: 'y', strategy: 'line-extents', paddingRatio: 0.05, minUpperBound: 1 }],
      },
    });

    relayoutHandler?.({ 'xaxis.range[0]': '2024-01-01' });
    relayoutHandler?.({ 'xaxis.range[0]': '2024-01-01' });

    expect(Plotly.relayout).toHaveBeenCalledTimes(1);

    resolveRelayout?.();
    await flushPromises();

    bindAutoFitYAxesOnXZoom(node, {
      data: [{ type: 'scatter', x: ['2024-01-01', '2024-01-02'], y: [1, 2] }],
      behaviors: {
        autoFitYAxesOnXZoom: [{ axis: 'y', strategy: 'line-extents', paddingRatio: 0.05, minUpperBound: 1 }],
      },
    });

    expect(removeListenerSpy).toHaveBeenCalledWith('plotly_relayout', firstHandler);
    expect(onSpy).toHaveBeenCalledTimes(2);
  });

  test('renders charts when HTML-escaped chart config contains apostrophes in chart labels', async () => {
    const taskName = "Judge's review";
    const chartConfig = JSON.stringify({
      data: [
        {
          x: [3],
          y: [taskName],
          customdata: [taskName],
          type: 'bar',
          orientation: 'h',
          hovertemplate: '<b>%{customdata}</b><br>%{x} tasks<extra></extra>',
        },
      ],
    });

    document.body.innerHTML = `<div class="analytics-chart" data-chart-config='${escapeHtmlAttribute(chartConfig)}'></div>`;

    const chartNode = document.querySelector<HTMLElement>('.analytics-chart');
    expect(chartNode?.dataset.chartConfig).toBe(chartConfig);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderCharts();
    await flushPromises();

    expect(Plotly.newPlot).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('binds scroll pan interactions', () => {
    const node = document.createElement('div');
    (node as unknown as { _fullLayout?: { yaxis?: { range?: [number, number] } } })._fullLayout = {
      yaxis: { range: [4, 0] },
    };
    (node as unknown as { on?: (event: string, handler: () => void) => void }).on = (_, handler) => handler();

    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C', 'D', 'E'] }] });
    const handle = node.querySelector<HTMLElement>('.analytics-chart-scroll-handle');
    handle?.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 20, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }));

    expect(Plotly.relayout).toHaveBeenCalled();
    expect(node.dataset.scrollPanBound).toBe('true');
  });

  test('rebinds relayout listener across repeated chart renders', () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: { yaxis?: { range?: [number, number] } };
      on?: (event: string, handler: () => void) => void;
      removeAllListeners?: (event: string) => void;
    };
    plotlyNode._fullLayout = { yaxis: { range: [4, 0] } };

    let relayoutHandler: (() => void) | undefined;
    const onSpy = jest.fn((_event: string, handler: () => void) => {
      relayoutHandler = handler;
    });
    const removeAllListenersSpy = jest.fn();
    plotlyNode.on = onSpy;
    plotlyNode.removeAllListeners = removeAllListenersSpy;

    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C', 'D', 'E'] }] });
    const handle = node.querySelector<HTMLElement>('.analytics-chart-scroll-handle');
    const firstTop = handle?.style.top;

    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C', 'D', 'E'] }] });
    plotlyNode._fullLayout = { yaxis: { range: [3, -1] } };
    relayoutHandler?.();

    expect(node.querySelectorAll('.analytics-chart-scroll-track')).toHaveLength(1);
    expect(onSpy).toHaveBeenCalledTimes(2);
    expect(removeAllListenersSpy).toHaveBeenCalledWith('plotly_relayout');
    expect(handle?.style.top).not.toBe(firstTop);
  });

  test('rebinds scroll-pan listeners through removeListener when needed', () => {
    const node = document.createElement('div');
    const plotlyNode = node as unknown as {
      _fullLayout?: { yaxis?: { range?: [number, number] } };
      on?: (event: string, handler: () => void) => void;
      removeListener?: (event: string, handler: () => void) => void;
    };
    plotlyNode._fullLayout = { yaxis: { range: [4, 0] } };

    let firstHandler: (() => void) | undefined;
    const onSpy = jest.fn((_event: string, handler: () => void) => {
      if (!firstHandler) {
        firstHandler = handler;
      }
    });
    const removeListenerSpy = jest.fn();
    plotlyNode.on = onSpy;
    plotlyNode.removeListener = removeListenerSpy;

    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C'] }] });
    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C', 'D'] }] });

    expect(removeListenerSpy).toHaveBeenCalledWith('plotly_relayout', firstHandler);
    expect(onSpy).toHaveBeenCalledTimes(2);
  });

  test('covers bindScrollPan guard paths', () => {
    const boundNode = document.createElement('div');
    boundNode.dataset.scrollPanBound = 'true';
    bindScrollPan(boundNode, { data: [{ y: ['A'] }] });

    const emptyNode = document.createElement('div');
    bindScrollPan(emptyNode, { data: [{ y: [] }] });

    const noRangeNode = document.createElement('div');
    bindScrollPan(noRangeNode, { data: [{ y: ['A', 'B'] }] });
    const noRangeHandle = noRangeNode.querySelector<HTMLElement>('.analytics-chart-scroll-handle');
    noRangeHandle?.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 20, bubbles: true }));
    noRangeNode.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }));

    const limitedRangeNode = document.createElement('div');
    (limitedRangeNode as unknown as { _fullLayout?: { yaxis?: { range?: [number, number] } } })._fullLayout = {
      yaxis: { range: [5, 0] },
    };
    bindScrollPan(limitedRangeNode, { data: [{ y: ['A', 'B'] }] });
    const limitedHandle = limitedRangeNode.querySelector<HTMLElement>('.analytics-chart-scroll-handle');
    limitedHandle?.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 20, bubbles: true }));

    const wheelNode = document.createElement('div');
    bindScrollPan(wheelNode, { data: [{ y: ['A', 'B'] }] });
    wheelNode.dispatchEvent(new WheelEvent('wheel', { deltaY: 0, bubbles: true }));

    expect(boundNode.dataset.scrollPanBound).toBe('true');
  });

  test('cancels pending drag animation on mouseup', () => {
    const node = document.createElement('div');
    (node as unknown as { _fullLayout?: { yaxis?: { range?: [number, number] } } })._fullLayout = {
      yaxis: { range: [4, 0] },
    };

    const originalRaf = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    window.requestAnimationFrame = jest.fn(() => 1);
    window.cancelAnimationFrame = jest.fn();

    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C'] }] });
    const handle = node.querySelector<HTMLElement>('.analytics-chart-scroll-handle');
    handle?.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 20, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);

    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancel;
  });

  test('handles non-array categories and wheel animation frames', () => {
    const nonArrayNode = document.createElement('div');
    bindScrollPan(nonArrayNode, { data: [{ y: 'A' as unknown as string }] });

    const node = document.createElement('div');
    (node as unknown as { _fullLayout?: { yaxis?: { range?: [number, number] } } })._fullLayout = {
      yaxis: { range: [4, 0] },
    };

    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = jest.fn(() => 1);

    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C'] }] });
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }));

    expect(window.requestAnimationFrame).toHaveBeenCalled();

    window.requestAnimationFrame = originalRaf;
  });

  test('requests and cancels animation frames during drag and wheel interactions', () => {
    const node = document.createElement('div');
    (node as unknown as { _fullLayout?: { yaxis?: { range?: [number, number] } } })._fullLayout = {
      yaxis: { range: [4, 0] },
    };

    const originalRaf = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    const rafSpy = jest.fn(() => 1);
    const cancelSpy = jest.fn();
    window.requestAnimationFrame = rafSpy;
    window.cancelAnimationFrame = cancelSpy;

    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C'] }] });
    const handle = node.querySelector<HTMLElement>('.analytics-chart-scroll-handle');
    handle?.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 20, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }));

    expect(rafSpy).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalledWith(1);

    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancel;
  });

  test('avoids redundant drag cancellations and wheel animation requests', () => {
    const node = document.createElement('div');
    (node as unknown as { _fullLayout?: { yaxis?: { range?: [number, number] } } })._fullLayout = {
      yaxis: { range: [4, 0] },
    };

    const originalRaf = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    const rafSpy = jest.fn(() => 1);
    const cancelSpy = jest.fn();
    window.requestAnimationFrame = rafSpy;
    window.cancelAnimationFrame = cancelSpy;

    bindScrollPan(node, { data: [{ y: ['A', 'B', 'C'] }] });
    const handle = node.querySelector<HTMLElement>('.analytics-chart-scroll-handle');
    handle?.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }));
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }));

    expect(cancelSpy).not.toHaveBeenCalled();
    expect(rafSpy).toHaveBeenCalledTimes(1);

    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancel;
  });

  test('labels modebar buttons and renders open-by-name charts', () => {
    const container = document.createElement('div');
    const alreadyLabeled = document.createElement('a');
    alreadyLabeled.className = 'modebar-btn';
    alreadyLabeled.setAttribute('aria-label', 'Existing');
    container.appendChild(alreadyLabeled);
    const unlabeled = document.createElement('a');
    unlabeled.className = 'modebar-btn';
    unlabeled.dataset.title = 'Zoom';
    container.appendChild(unlabeled);
    const missingLabel = document.createElement('a');
    missingLabel.className = 'modebar-btn';
    container.appendChild(missingLabel);

    labelModebarButtons(container);
    expect(alreadyLabeled.getAttribute('aria-label')).toBe('Existing');
    expect(unlabeled.getAttribute('aria-label')).toBe('Zoom');
    expect(missingLabel.getAttribute('aria-label')).toBeNull();

    const node = document.createElement('div');
    renderOpenByNameChart(node, { data: [{ y: ['A', 'B', 'C'] }] });
    expect(Plotly.newPlot).toHaveBeenCalled();
  });
});
