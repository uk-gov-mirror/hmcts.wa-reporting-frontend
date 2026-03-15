import { Locator, Page } from '@playwright/test';

import { buildUrl } from '../../../config';
import { waitForSectionContentOrWarning } from './plotlyChart';

export class AnalyticsOverviewPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(buildUrl('/'));
  }

  get heading(): Locator {
    return this.page.getByRole('heading', {
      name: 'Service performance overview',
      level: 1,
    });
  }

  get taskEventsHeading(): Locator {
    return this.page.getByRole('heading', {
      name: 'Created, completed and cancelled tasks by service',
      level: 2,
    });
  }

  get taskEventsSection(): Locator {
    return this.page.locator('[data-section="overview-task-events"]');
  }

  get taskEventsCancelledHeader(): Locator {
    return this.page.locator('[data-section="overview-task-events"] th', { hasText: 'Cancelled' });
  }

  async waitForTaskEventsSectionReady(): Promise<void> {
    await waitForSectionContentOrWarning(this.taskEventsCancelledHeader, this.taskEventsSection);
  }
}
