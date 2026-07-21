import { expect, test, type Page } from '@playwright/test';

const POOL_ADDRESS = '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6';

async function barHeights(page: Page): Promise<number[]> {
  return page.locator('[data-testid^="meteora-liquidity-bar-"]').evaluateAll(
    (bars) => bars.map((bar) => bar.getBoundingClientRect().height),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/markets/meteora/${POOL_ADDRESS}?e2e=1`, {
    waitUntil: 'commit',
  });
  await expect(page.getByRole('radio', { name: 'Spot' })).toBeVisible();
});

// Beta ships one server-calculated default range with no manual min/max entry
// and no draggable handles (see the PRD's Beta Scope Amendment, 2026-07-21).
// This regression check replaces the earlier draggable-range assertions.
test('range has no manual price entry or draggable handles', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Min Price' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Max Price' })).toHaveCount(0);
  await expect(page.getByTestId('meteora-min-handle')).toHaveCount(0);
  await expect(page.getByTestId('meteora-max-handle')).toHaveCount(0);
  await expect(page.getByText('This range is calculated automatically for beta and cannot be edited.')).toBeVisible();
});

test('default range fills the chart and Execution Preview is absent', async ({ page }) => {
  const track = page.getByTestId('meteora-range-track');
  const trackBox = await track.boundingBox();
  if (!trackBox) throw new Error('Range geometry is unavailable');

  const edgeColors = await page.locator(
    '[data-testid="meteora-liquidity-bar-0"], [data-testid="meteora-liquidity-bar-23"]',
  ).evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar).backgroundColor));
  expect(edgeColors[0]).toBe(edgeColors[1]);
  expect(edgeColors[0]).not.toBe('rgb(52, 58, 85)');
  await expect(page.getByText('Execution Preview', { exact: true })).toHaveCount(0);
});

test('Spot, Curve, and Bid Ask render distinct responsive shapes', async ({ page }) => {
  const spot = await barHeights(page);
  expect(Math.max(...spot) - Math.min(...spot)).toBeLessThanOrEqual(1);

  await page.getByRole('radio', { name: 'Curve' }).click();
  const curve = await barHeights(page);
  expect(curve[12]).toBeGreaterThan(curve[0]);

  await page.getByRole('radio', { name: 'Bid Ask' }).click();
  const bidAsk = await barHeights(page);
  expect(bidAsk[0]).toBeGreaterThan(bidAsk[12]);
  expect(bidAsk).not.toEqual(curve);
});
