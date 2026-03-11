import type { Express, Request, Response } from 'express';

const boldCellClass = 'govuk-!-font-weight-bold';

describe('Nunjucks module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('configures nunjucks and registers helpers', () => {
    const app = { set: jest.fn(), use: jest.fn() } as unknown as Express;

    type FilterFn = (...args: unknown[]) => unknown;
    const filters: Record<string, FilterFn> = {};
    const env = {
      addGlobal: jest.fn(),
      addFilter: jest.fn((name: string, fn: FilterFn) => {
        filters[name] = fn;
      }),
    };

    const configure = jest.fn(() => env);

    jest.doMock('nunjucks', () => ({
      configure,
    }));

    jest.doMock('config', () => ({
      get: jest.fn((key: string) => {
        if (key === 'analytics.manageCaseBaseUrl') {
          return 'http://manage-case';
        }
        return undefined;
      }),
    }));

    jest.isolateModules(() => {
      const { Nunjucks } = require('../../../../main/modules/nunjucks');
      new Nunjucks(true).enableFor(app);
    });

    expect(app.set).toHaveBeenCalledWith('view engine', 'njk');
    expect(env.addGlobal).toHaveBeenCalledWith('manageCaseBaseUrl', 'http://manage-case');

    const formatNumber = filters.formatNumber;
    expect(formatNumber('text')).toBe('text');
    expect(formatNumber(undefined)).toBe('');
    expect(formatNumber(1200, { maximumFractionDigits: 0 })).toContain('1');

    const extractNumericColumns = filters.extractNumericColumns;
    expect(extractNumericColumns([{ text: 'A' }, { format: 'numeric' }, { format: 'text' }])).toEqual([1]);
    expect(extractNumericColumns()).toEqual([]);

    type TableCell = { text?: string; format?: string; classes?: string };
    const decorateNumericRows = filters.decorateNumericRows as (
      rows: TableCell[][] | string,
      numericColumns?: number[],
      options?: { boldLastRow?: boolean; boldRows?: number[] }
    ) => TableCell[][] | string;
    const rows = [
      [{ text: '1', format: 'numeric', classes: 'existing' }, { text: 'x' }],
      [{ text: '2', format: 'numeric' }, { text: 'y' }],
    ];

    const decorated = decorateNumericRows(rows, [0], { boldLastRow: true }) as TableCell[][];
    expect(decorated[0][0].classes).toContain('existing');
    expect(decorated[1][0].classes).toContain(boldCellClass);
    expect(decorated[1][0].format).toBe('numeric');
    expect(decorateNumericRows('invalid')).toBe('invalid');
    const undecorated = decorateNumericRows([[{ text: 'x' }, { text: 'y', format: 'text' }]], [], {
      boldRows: [2],
    }) as TableCell[][];
    expect(undecorated[0][0].classes).toBeUndefined();
    expect(undecorated[0][1].format).toBe('text');

    const middleware = (app.use as jest.Mock).mock.calls.find(call => call[0].length === 3)?.[0];
    const req = { path: '/', originalUrl: '/?service=Crime' } as Request;
    const res = { locals: {} } as Response;
    middleware(req, res, jest.fn());

    expect(res.locals.pagePath).toBe('/');
  });

  it('does not require query string handling', () => {
    const app = { set: jest.fn(), use: jest.fn() } as unknown as Express;
    const env = { addGlobal: jest.fn(), addFilter: jest.fn() };

    jest.doMock('nunjucks', () => ({
      configure: jest.fn(() => env),
    }));

    jest.doMock('config', () => ({
      get: jest.fn(() => undefined),
    }));

    jest.isolateModules(() => {
      const { Nunjucks } = require('../../../../main/modules/nunjucks');
      new Nunjucks(false).enableFor(app);
    });

    const middleware = (app.use as jest.Mock).mock.calls.find(call => call[0].length === 3)?.[0];
    const req = { path: '/', originalUrl: '/' } as Request;
    const res = { locals: {} } as Response;
    middleware(req, res, jest.fn());

    expect(res.locals.pagePath).toBe('/');
  });

  it('covers internal helpers for class and numeric decoration', () => {
    jest.isolateModules(() => {
      const { __testing } = require('../../../../main/modules/nunjucks');
      expect(__testing.addClasses('existing', ['extra', 'existing'])).toBe('existing extra');
      expect(__testing.addClasses(undefined, [])).toBeUndefined();
      expect(__testing.extractNumericColumns([{ format: 'numeric' }, { text: 'A' }])).toEqual([0]);
      expect(__testing.extractNumericColumns()).toEqual([]);

      const rows = __testing.decorateNumericRows([[{ text: '1' }]], [0], {});
      expect(rows[0][0].format).toBe('numeric');
      const defaultRows = __testing.decorateNumericRows([[{ text: '2' }]]);
      expect(defaultRows[0][0].format).toBeUndefined();
    });
  });
});
