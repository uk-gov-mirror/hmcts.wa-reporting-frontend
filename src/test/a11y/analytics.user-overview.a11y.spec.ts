import { AnalyticsUserOverviewPage } from '../playwright/page-objects/pages';
import { expect, test } from '../playwright/fixtures';

import { A11Y_EXCLUDED_SELECTORS } from './a11y.constants';

test.describe('Analytics user overview page accessibility', () => {
  test('should have no accessibility errors @a11y', async ({ page, axeUtils }) => {
    const analyticsUserOverviewPage = new AnalyticsUserOverviewPage(page);

    await analyticsUserOverviewPage.goto();

    await expect(analyticsUserOverviewPage.heading).toBeVisible();
    await axeUtils.audit({ exclude: A11Y_EXCLUDED_SELECTORS });
  });
});
