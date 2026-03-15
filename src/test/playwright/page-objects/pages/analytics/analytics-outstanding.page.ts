import { Locator, Page } from '@playwright/test';

import { buildUrl } from '../../../config';
import { waitForPlotlyChartOrWarning } from './plotlyChart';

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

  get openTasksSection(): Locator {
    return this.page.locator('[data-section="open-tasks-table"]');
  }

  async waitForOpenTasksSectionReady(): Promise<void> {
    await waitForPlotlyChartOrWarning(this.openTasksChart, this.openTasksSection);
  }
}
