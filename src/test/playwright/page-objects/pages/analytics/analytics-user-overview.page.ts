import { Locator, Page } from '@playwright/test';

import { buildUrl } from '../../../config';

export class AnalyticsUserOverviewPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(buildUrl('/users'));
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'User overview', level: 1 });
  }
}
