const { test, expect } = require('@playwright/test');

test('smoke: core UI loads and actions are visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toHaveText('Spartan Orion Screener');
  await expect(page.locator('#scanBtn')).toBeVisible();
  await expect(page.locator('#themeToggleBtn')).toBeVisible();

  const initialTheme = await page.evaluate(() => (
    document.documentElement.getAttribute('data-theme') || 'dark'
  ));
  await page.click('#themeToggleBtn');
  await expect.poll(async () => (
    page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'dark')
  )).not.toBe(initialTheme);

  await page.evaluate(() => {
    picks = [{
      symbol: 'TEST/USDT',
      exchange: 'binanceusdm',
      price: 1.23,
      priceChange1h: 1,
      priceChange4h: 2,
      priceChange24h: 3,
      volume24h: 1200000,
      volatility15m: 0.5,
      ticks5m: 500,
      ticks15m: 900,
    }];
    renderPicks();
  });

  const actions = page.locator('.actions');
  await expect(actions).toBeVisible();
  const opacity = await actions.evaluate(el => getComputedStyle(el).opacity);
  expect(opacity).toBe('1');

  const actionButtons = page.locator('.actions .action-btn');
  await expect(actionButtons).toHaveCount(3);

  const visibleButtons = page.locator('.actions .action-btn:not(.mobile-chart-btn)');
  await expect(visibleButtons).toHaveCount(2);
  await expect(visibleButtons.first()).toBeVisible();
});
