import { AnalyticsOutstandingPage } from '../playwright/page-objects/pages';
import { expect, test } from '../playwright/fixtures';

import { A11Y_EXCLUDED_SELECTORS } from './a11y.constants';

test.describe('Analytics outstanding page accessibility', () => {
  test('should have no accessibility errors @a11y', async ({ page, axeUtils }) => {
    const analyticsOutstandingPage = new AnalyticsOutstandingPage(page);

    await analyticsOutstandingPage.goto();

    await expect(analyticsOutstandingPage.heading).toBeVisible();
    await axeUtils.audit({ exclude: A11Y_EXCLUDED_SELECTORS });
  });
});
