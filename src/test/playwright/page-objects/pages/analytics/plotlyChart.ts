import { Locator, expect } from '@playwright/test';

export async function waitForPlotlyChart(chart: Locator): Promise<void> {
  await expect(chart).toBeVisible();
  await expect
    .poll(async () => chart.evaluate(node => Boolean((node as { _fullLayout?: unknown })._fullLayout)))
    .toBe(true);
}

export async function waitForSectionContentOrWarning(
  content: Locator,
  section: Locator
): Promise<'content' | 'warning'> {
  const warning = section.locator('[data-analytics-section-error="true"]');

  await expect
    .poll(async () => {
      if (await warning.isVisible()) {
        return 'warning';
      }
      if (await content.isVisible()) {
        return 'content';
      }
      return 'loading';
    })
    .not.toBe('loading');

  return (await warning.isVisible()) ? 'warning' : 'content';
}

export async function waitForPlotlyChartOrWarning(chart: Locator, section: Locator): Promise<void> {
  const state = await waitForSectionContentOrWarning(chart, section);
  if (state === 'warning') {
    return;
  }

  await expect
    .poll(async () => chart.evaluate(node => Boolean((node as { _fullLayout?: unknown })._fullLayout)))
    .toBe(true);
}
