import { Locator, expect } from '@playwright/test';

export async function waitForPlotlyChart(chart: Locator): Promise<void> {
  await expect(chart).toBeVisible();
  await expect
    .poll(async () => chart.evaluate(node => Boolean((node as { _fullLayout?: unknown })._fullLayout)))
    .toBe(true);
}
