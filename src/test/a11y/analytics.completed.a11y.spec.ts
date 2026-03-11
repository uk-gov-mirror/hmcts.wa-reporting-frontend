import { AnalyticsCompletedPage } from '../playwright/page-objects/pages';
import { expect, test } from '../playwright/fixtures';

import { A11Y_EXCLUDED_SELECTORS } from './a11y.constants';

test.describe('Analytics completed page accessibility', () => {
  test('should have no accessibility errors @a11y', async ({ page, axeUtils }) => {
    const analyticsCompletedPage = new AnalyticsCompletedPage(page);

    await analyticsCompletedPage.goto();

    await expect(analyticsCompletedPage.heading).toBeVisible();
    await axeUtils.audit({ exclude: A11Y_EXCLUDED_SELECTORS });
  });
});
