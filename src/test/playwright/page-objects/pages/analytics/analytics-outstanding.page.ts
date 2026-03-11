import { Locator, Page } from '@playwright/test';

import { buildUrl } from '../../../config';

export class AnalyticsOutstandingPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(buildUrl('/outstanding'));
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Tasks outstanding', level: 1 });
  }
}
