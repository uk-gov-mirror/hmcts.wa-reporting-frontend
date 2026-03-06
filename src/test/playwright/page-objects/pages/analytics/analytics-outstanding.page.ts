import { Locator, Page } from '@playwright/test';

import { buildUrl } from '../../../config';
import { waitForPlotlyChart } from './plotlyChart';

export class AnalyticsOutstandingPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(buildUrl('/outstanding'));
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Tasks outstanding', level: 1 });
  }

  get openTasksChart(): Locator {
    return this.page.locator('#openTasksChart .analytics-chart');
  }

  async waitForOpenTasksChart(): Promise<void> {
    await waitForPlotlyChart(this.openTasksChart);
  }
}
