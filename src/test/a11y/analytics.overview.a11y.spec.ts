import { AnalyticsOverviewPage } from '../playwright/page-objects/pages';
import { expect, test } from '../playwright/fixtures';

import { A11Y_EXCLUDED_SELECTORS } from './a11y.constants';

test.describe('Analytics overview page accessibility', () => {
  test('should have no accessibility errors @a11y', async ({ page, axeUtils }) => {
    const analyticsOverviewPage = new AnalyticsOverviewPage(page);

    await analyticsOverviewPage.goto();

    await expect(analyticsOverviewPage.heading).toBeVisible();
    await expect(analyticsOverviewPage.taskEventsHeading).toBeVisible();
    await analyticsOverviewPage.waitForTaskEventsSectionReady();
    await axeUtils.audit({ exclude: A11Y_EXCLUDED_SELECTORS });
  });
});
