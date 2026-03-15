import { Locator, Page } from '@playwright/test';

import { buildUrl } from '../../../config';
import { waitForPlotlyChartOrWarning } from './plotlyChart';

export class AnalyticsCompletedPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(buildUrl('/completed'));
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Completed tasks', level: 1 });
  }

  get processingAndHandlingTimeText(): Locator {
    return this.page.getByText('Processing and handling time');
  }

  get processingHandlingTimeChart(): Locator {
    return this.page.locator('#processingHandlingTimeChart .analytics-chart');
  }

  get processingHandlingTimeSection(): Locator {
    return this.page.locator('[data-section="completed-processing-handling-time"]');
  }

  async waitForProcessingHandlingTimeSectionReady(): Promise<void> {
    await waitForPlotlyChartOrWarning(this.processingHandlingTimeChart, this.processingHandlingTimeSection);
  }
}
