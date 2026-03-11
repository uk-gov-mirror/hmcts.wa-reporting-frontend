import * as path from 'path';

import config = require('config');
import * as express from 'express';
import * as nunjucks from 'nunjucks';

import { formatNumber } from '../analytics/shared/formatting';

const boldCellClass = 'govuk-!-font-weight-bold';

type TableCell = {
  text?: string;
  html?: string;
  classes?: string;
  [key: string]: unknown;
};

type NumericRowsOptions = {
  boldLastRow?: boolean;
  boldRows?: number[];
};

function addClasses(current: unknown, classes: string[]): string | undefined {
  const currentClasses = typeof current === 'string' ? current.split(' ') : [];
  const combined = [...currentClasses, ...classes].filter(Boolean);
  const unique = Array.from(new Set(combined)).join(' ').trim();
  return unique.length > 0 ? unique : undefined;
}

function extractNumericColumns(head: TableCell[] = []): number[] {
  return head.reduce<number[]>((acc, cell, index) => {
    if (cell?.format === 'numeric') {
      acc.push(index);
    }
    return acc;
  }, []);
}

function decorateNumericRows(
  rows: TableCell[][],
  numericColumns: number[] = [],
  options: NumericRowsOptions = {}
): TableCell[][] {
  const numericSet = new Set(numericColumns);
  const boldRows = new Set(options.boldRows ?? []);
  const lastRowIndex = rows.length - 1;
  return rows.map((row, rowIndex) => {
    const isBold = boldRows.has(rowIndex) || (options.boldLastRow && rowIndex === lastRowIndex);
    return row.map((cell, colIndex) => {
      const extraClasses: string[] = [];
      const shouldFormatNumeric = numericSet.has(colIndex);
      if (isBold) {
        extraClasses.push(boldCellClass);
      }
      const classes = addClasses(cell?.classes, extraClasses);
      const format = shouldFormatNumeric ? (cell?.format ?? 'numeric') : cell?.format;
      return { ...cell, classes, format };
    });
  });
}

export class Nunjucks {
  constructor(public developmentMode: boolean) {
    this.developmentMode = developmentMode;
  }

  enableFor(app: express.Express): void {
    app.set('view engine', 'njk');
    const govukTemplates = path.dirname(require.resolve('govuk-frontend/package.json')) + '/dist';
    const mojTemplates = path.dirname(require.resolve('@ministryofjustice/frontend/package.json')) + '/moj';
    const viewsPath = path.join(__dirname, '..', '..', 'views');

    const nunjucksEnv = nunjucks.configure([govukTemplates, mojTemplates, viewsPath], {
      autoescape: true,
      watch: this.developmentMode,
      express: app,
    });

    nunjucksEnv.addGlobal('manageCaseBaseUrl', config.get('analytics.manageCaseBaseUrl'));
    nunjucksEnv.addFilter('formatNumber', (value: unknown, options: Intl.NumberFormatOptions = {}) => {
      if (typeof value !== 'number') {
        return value ?? '';
      }
      return formatNumber(value, options);
    });
    nunjucksEnv.addFilter('extractNumericColumns', (head: TableCell[] = []) => extractNumericColumns(head));
    nunjucksEnv.addFilter('decorateNumericRows', (rows: TableCell[][], numericColumns = [], options = {}) => {
      if (!Array.isArray(rows)) {
        return rows;
      }
      return decorateNumericRows(rows, numericColumns, options);
    });

    app.use((req, res, next) => {
      res.locals.pagePath = req.path;
      next();
    });
  }
}

export const __testing = {
  addClasses,
  extractNumericColumns,
  decorateNumericRows,
};
