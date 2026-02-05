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

test('highlights: top candidates show badges in results and chart modal', async ({ page }) => {
  await page.goto('/');

  const topSymbols = await page.evaluate(() => {
    latestBtcChange24h = 2.25;
    picks = [
      {
        symbol: 'ALPHA/USDT',
        exchange: 'binanceusdm',
        price: 10,
        priceChange1h: 1.2,
        priceChange4h: 2.4,
        priceChange24h: 4.8,
        volume24h: 150000000,
        volatility15m: 0.6,
        ticks5m: 1200,
        ticks15m: 4200,
      },
      {
        symbol: 'BRAVO/USDT',
        exchange: 'binanceusdm',
        price: 5,
        priceChange1h: -0.8,
        priceChange4h: -1.4,
        priceChange24h: -3.1,
        volume24h: 90000000,
        volatility15m: 0.55,
        ticks5m: 900,
        ticks15m: 3000,
      },
      {
        symbol: 'CHARLIE/USDT',
        exchange: 'binanceusdm',
        price: 1.2,
        priceChange1h: 2.4,
        priceChange4h: 5.2,
        priceChange24h: 9.9,
        volume24h: 250000000,
        volatility15m: 0.72,
        ticks5m: 700,
        ticks15m: 2100,
      },
      {
        symbol: 'DELTA/USDT',
        exchange: 'binanceusdm',
        price: 0.42,
        priceChange1h: 0.1,
        priceChange4h: 0.2,
        priceChange24h: 0.3,
        volume24h: 12000000,
        volatility15m: 0.2,
        ticks5m: 1800,
        ticks15m: 5000,
      },
    ];
    renderPicks();
    return candidateHighlights.topSymbols;
  });

  expect(topSymbols.length).toBe(3);
  await expect(page.locator('#resultsList .candidate-badge')).toHaveCount(3);
  await expect(page.locator('#resultsList .candidate-badge')).toContainText(['Top 1', 'Top 2', 'Top 3']);

  const firstThreeSymbols = await page.locator('#resultsList .pick-card .symbol').evaluateAll(
    (els) => els.slice(0, 3).map((el) => el.textContent)
  );
  expect(firstThreeSymbols).toEqual(topSymbols);

  // No native title tooltip (we use the custom hover/tap tooltip).
  await expect(page.locator('#resultsList .candidate-badge').first()).not.toHaveAttribute('title');

  const firstWrap = page.locator('#resultsList .candidate-badge-wrap').first();
  await firstWrap.locator('.candidate-badge').hover();
  await expect(firstWrap.locator('.candidate-tooltip')).toBeVisible();
  await expect(firstWrap.locator('.candidate-tooltip-title')).toBeVisible();

  await page.evaluate((symbol) => {
    const preview = document.getElementById('chartPreview');
    preview.classList.add('visible');
    preview.classList.add('maximized');
    document.getElementById('chartPreviewSymbol').textContent = symbol;
    updateChartPreviewCandidateBadge(symbol);
  }, topSymbols[0]);

  await expect(page.locator('#chartPreviewCandidateWrap')).toBeVisible();
  await expect(page.locator('#chartPreviewCandidateBadge')).toContainText('Top');
  await expect(page.locator('#chartPreviewCandidateBadge')).not.toHaveAttribute('title');

  await page.locator('#chartPreviewCandidateBadge').hover();
  await expect(page.locator('#chartPreviewCandidateTooltip')).toBeVisible();
  await expect(page.locator('#chartPreviewCandidateTooltip .candidate-tooltip-title')).toBeVisible();
});
