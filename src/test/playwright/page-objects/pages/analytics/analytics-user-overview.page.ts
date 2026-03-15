import { Locator, Page } from '@playwright/test';

import { buildUrl } from '../../../config';
import { waitForPlotlyChartOrWarning } from './plotlyChart';

export class AnalyticsUserOverviewPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(buildUrl('/users'));
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'User overview', level: 1 });
  }

  get completedByDateChart(): Locator {
    return this.page.locator('#completedByDateChart .analytics-chart');
  }

  get completedByDateSection(): Locator {
    return this.page.locator('[data-section="user-overview-completed-by-date"]');
  }

  async waitForCompletedByDateSectionReady(): Promise<void> {
    await waitForPlotlyChartOrWarning(this.completedByDateChart, this.completedByDateSection);
  }
}
