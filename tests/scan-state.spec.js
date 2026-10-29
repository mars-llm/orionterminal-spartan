const { test, expect } = require('./coverage.fixture');

test.skip(!!process.env.E2E_BASE_URL, 'Scan state regressions verify the local implementation');

async function prepareScan(page, handler) {
  await page.route('https://screener.orionterminal.com/api/screener', handler);
  await page.goto('./');
  await page.evaluate(() => {
    clearDirectApiBlocked();
    chartSettings.enabled = false;
  });
}

const tickers = ['ALPHA', 'BRAVO'].map((symbol, index) => ({
  symbol: symbol + 'USDT', price: '2.5',
  tf1d: { volume: '2000000', changePercent: '2' },
  tf15m: { volatility: '0.5', trades: '1800' },
  tf5m: { trades: String(600 + index * 100) },
}));

test('scan: changed filters can be restored or rescanned without duplicate requests', async ({ page }) => {
  let requests = 0;
  let releaseRescan;
  const rescanGate = new Promise((resolve) => { releaseRescan = resolve; });
  await prepareScan(page, async (route) => {
    requests += 1;
    if (requests === 2) await rescanGate;
    await route.fulfill({ json: { tickers } });
  });
  const rescan = page.getByRole('button', { name: 'Filters changed · Rescan' });
  await expect(rescan).toBeHidden();
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
  await expect(rescan).toBeHidden();
  await page.locator('#filtersBtn').click();

  await page.locator('#maxResults').fill('1');
  await page.locator('#maxResults').blur();
  await expect(rescan).toBeVisible();
  await page.locator('#maxResults').fill('10');
  await page.locator('#maxResults').blur();
  await expect(rescan).toBeHidden();
  await page.getByRole('button', { name: 'High Volume Majors' }).click();
  await expect(rescan).toBeVisible();
  await page.locator('#resetBtn').click();
  await expect(rescan).toBeHidden();

  await page.locator('#maxResults').fill('1');
  await page.locator('#maxResults').blur();
  await page.setViewportSize({ width: 375, height: 812 });
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll('body *')).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > innerWidth && rect.width > 0;
    }).slice(0, 8).map((element) => element.className),
  }));
  expect(layout.width, JSON.stringify(layout.overflowing)).toBeLessThanOrEqual(375);
  try {
    await rescan.click();
    await expect(rescan).toBeDisabled();
    await expect(rescan).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => handleScan());
    await expect.poll(() => requests).toBe(2);
  } finally {
    releaseRescan();
  }
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(1);
  await expect(rescan).toBeHidden();
  await expect(page.locator('#scanBtn')).toBeFocused();
  expect(requests).toBe(2);
});

test('scan: failed refresh keeps the old capture time and empty refresh clears obsolete results', async ({ page }) => {
  await prepareScan(page, (route) => route.fulfill({ json: { tickers } }));
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
  const expectedTime = await page.evaluate(() => {
    lastSuccessfulScanSnapshot.createdAt = new Date(Date.now() - 60000).toISOString();
    renderPicks();
    const expected = new Date(lastSuccessfulScanSnapshot.createdAt).toLocaleTimeString();
    renderPicks();
    return expected;
  });
  await expect(page.locator('#lastUpdated')).toHaveText(expectedTime);
  await page.locator('#filtersBtn').click();
  await page.locator('#maxResults').fill('1');
  await page.locator('#maxResults').blur();
  await page.evaluate(() => {
    fetchScreenerWithRetry = async () => { throw new Error('Fixture unavailable'); };
  });
  const rescan = page.locator('#rescanFiltersBtn');
  await rescan.click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(rescan).toBeEnabled();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
  await expect(page.locator('#lastUpdated')).toHaveText(expectedTime);

  await page.evaluate(() => {
    fetchScreenerWithRetry = async () => [];
    document.getElementById('chartPreview').classList.add('visible');
    isChartMaximized = true;
    chartPreviewAbortController = new AbortController();
    window.obsoleteChartSignal = chartPreviewAbortController.signal;
    chartPreviewTimeout = setTimeout(() => {
      document.getElementById('chartPreview').classList.add('visible');
    }, 1000);
  });
  await page.locator('#retryScanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(0);
  await expect(page.locator('#resultsContainer')).toBeHidden();
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(rescan).toBeHidden();
  await expect(page.locator('#chartPreview')).toBeHidden();
  expect(await page.evaluate(() => ({
    aborted: window.obsoleteChartSignal.aborted,
    pendingHover: chartPreviewTimeout,
  }))).toEqual({ aborted: true, pendingHover: null });

  await page.locator('#maxResults').fill('2');
  await page.locator('#maxResults').blur();
  await expect(rescan).toBeVisible();
  await rescan.click();
  await expect(rescan).toBeHidden();
});

test('scan: new badges compare consecutive successful scans and survive rerenders', async ({ page }, testInfo) => {
  let payload = tickers;
  await prepareScan(page, (route) => route.fulfill({ json: { tickers: payload } }));
  const scan = page.locator('#scanBtn');
  const badges = page.locator('#resultsList .new-setup-badge');
  const card = (symbol) => page.locator('#resultsList .pick-card').filter({ hasText: symbol + '/USDT' });
  await scan.click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
  await expect(badges).toHaveCount(0);

  payload = [tickers[0], { ...tickers[1], symbol: 'CHARLIEUSDT' }];
  await scan.click();
  await expect(card('CHARLIE')).toBeVisible();
  await expect(badges).toHaveCount(1);
  await expect(card('CHARLIE').locator('.new-setup-badge')).toHaveText('New since last scan');
  await expect(card('ALPHA').locator('.new-setup-badge')).toHaveCount(0);
  await page.evaluate(() => renderPicks());
  await expect(badges).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('output/playwright/new-setups-desktop.png'), fullPage: true });

  // New badges coexist with candidate rankings without widening the phone layout.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => applyTheme(value, false), theme);
    await expect(card('CHARLIE').locator('.new-setup-badge')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.screenshot({ path: testInfo.outputPath('output/playwright/new-setups-mobile-' + theme + '.png'), fullPage: true });
  }

  await scan.click();
  await expect(badges).toHaveCount(0);
  await expect(scan).toBeEnabled();
});

test('scan: filter changes reset the new-setup comparison until the next matching scan', async ({ page }) => {
  let payload = tickers;
  await prepareScan(page, (route) => route.fulfill({ json: { tickers: payload } }));
  const scan = page.locator('#scanBtn');
  const badges = page.locator('#resultsList .new-setup-badge');
  await scan.click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
  await page.locator('#filtersBtn').click();
  await page.locator('#minTicks').fill('501');
  await page.locator('#minTicks').blur();
  payload = [tickers[0], { ...tickers[1], symbol: 'CHARLIEUSDT' }];
  await page.locator('#rescanFiltersBtn').click();
  await expect(page.locator('#resultsList .symbol')).toContainText(['CHARLIE/USDT', 'ALPHA/USDT']);
  await expect(badges).toHaveCount(0);

  payload = [tickers[0], { ...tickers[1], symbol: 'DELTAUSDT' }];
  await scan.click();
  await expect(page.locator('#resultsList .pick-card').filter({ hasText: 'DELTA/USDT' }).locator('.new-setup-badge')).toHaveCount(1);
  await expect(badges).toHaveCount(1);

  // Returning to an older filter set compares only with the immediately previous scan.
  await page.locator('#resetBtn').click();
  payload = tickers;
  await page.locator('#rescanFiltersBtn').click();
  await expect(page.locator('#resultsList .symbol')).toContainText(['BRAVO/USDT', 'ALPHA/USDT']);
  await expect(badges).toHaveCount(0);
});

test('scan: failed scans preserve the baseline and successful empty scans replace it', async ({ page }) => {
  let payload = tickers;
  await prepareScan(page, (route) => route.fulfill({ json: { tickers: payload } }));
  const scan = page.locator('#scanBtn');
  const badges = page.locator('#resultsList .new-setup-badge');
  await scan.click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
  payload = [tickers[0], { ...tickers[1], symbol: 'CHARLIEUSDT' }];
  await scan.click();
  await expect(badges).toHaveCount(1);
  await page.evaluate(() => {
    window.originalScanWithRetry = fetchScreenerWithRetry;
    fetchScreenerWithRetry = async () => { throw new Error('Fixture unavailable'); };
  });
  await scan.click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(badges).toHaveCount(1);
  await expect(page.locator('#resultsList .pick-card').filter({ hasText: 'CHARLIE/USDT' }).locator('.new-setup-badge')).toHaveCount(1);
  await page.evaluate(() => { fetchScreenerWithRetry = window.originalScanWithRetry; });

  payload = [...payload, { ...tickers[1], symbol: 'DELTAUSDT' }];
  await page.locator('#retryScanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(3);
  await expect(badges).toHaveCount(1);
  await expect(page.locator('#resultsList .pick-card').filter({ hasText: 'DELTA/USDT' }).locator('.new-setup-badge')).toHaveCount(1);

  payload = [];
  await scan.click();
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(badges).toHaveCount(0);
  payload = [tickers[0]];
  await scan.click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(1);
  await expect(badges).toHaveCount(1);
});
