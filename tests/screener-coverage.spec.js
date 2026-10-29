const { test, expect } = require('./coverage.fixture');

test.skip(!!process.env.E2E_BASE_URL, 'Source coverage regressions use local fixture data');

const ticker = (symbol, volatility = 0.5, baseAsset = symbol.replace(/USDT$|USDC$/, '')) => ({
  symbol, baseAsset, price: '2.5',
  tf1d: { volume: '2000000000', changePercent: '2' },
  tf15m: { volatility: String(volatility), trades: '1800' },
  tf5m: { trades: '600' },
});
const preview = {
  type: 'full', access: 'preview', symbolCount: 795, matchedCount: 795, previewLimit: 8,
  tickers: [
    ticker('BTCUSDT', 0.02), ticker('ETHUSDT', 0.03),
    ticker('SOXLUSDT', 0.11), ticker('SKHYNIXUSDT', 0.06),
    ticker('BTCUSDC', 0.02), ticker('XAUUSDT', 0.015),
    ticker('SNDKUSDT', 0.045), ticker('ETHUSDC', 0.03),
  ],
};

async function openScanner(page, getPayload) {
  await page.route('https://screener.orionterminal.com/api/screener', (route) =>
    route.fulfill({ json: getPayload() }));
  await page.goto('./');
  await page.evaluate(() => { fetchScreener = fetchOrionScreener; clearDirectApiBlocked(); chartSettings.enabled = false; });
}

test('screener: only explicit matching USDT pairs reach results and action links', async ({ page }) => {
  const rows = [
    ticker('BTCUSDT'), ticker('BTCUSDC'), ticker('ETHUSDC'),
    ticker('eth/usdt', 0.5, 'eth'), ticker('SOLUSDT', 0.5, 'ETH'),
    { ...ticker('NOSYMBOLUSDT'), symbol: undefined },
    ticker('BAD&LIMIT=100USDT', 0.5, 'SAFE'), ticker('1000SHIBUSDT'),
  ];
  await openScanner(page, () => ({ tickers: rows }));
  await page.evaluate(() => {
    currentFilters = sanitizeFilterState({ minVolume: 0, minVolatility15m: 0, minTicks5m: 0, maxResults: 100, excludeSymbols: [] });
    updateFilterInputs();
  });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(3);
  const symbols = await page.locator('#resultsList .symbol').allTextContents();
  expect(symbols.sort()).toEqual(['1000SHIB/USDT', 'BTC/USDT', 'ETH/USDT']);
  expect(await page.locator('#resultsList a').evaluateAll(links =>
    links.map(link => new URL(link.href).searchParams.get('symbol')).sort()))
    .toEqual(['BINANCE:1000SHIBUSDT.P', 'BINANCE:BTCUSDT.P', 'BINANCE:ETHUSDT.P']);
  const legacy = await page.evaluate(() => parseScreenerData({
    'BTC/USDT-binanceusdm': { '10': [0, 2000000], '11': 2.5 },
    'BTC/USDC-binanceusdm': { '10': [0, 2000000], '11': 2.5 },
  }).map(pick => pick.symbol));
  expect(legacy).toEqual(['BTC/USDT']);
});

test('screener: coverage metadata validates counts and does not trust type full', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(() => {
    const sample = { symbol: 'SAFEUSDT' };
    const describe = (metadata) => getScreenerCoverage({ tickers: [sample], ...metadata }, 1);
    return {
      preview: describe({ type: 'full', access: 'preview', symbolCount: '795', matchedCount: '795' }),
      partial: describe({ type: 'full', access: 'full', symbolCount: 795 }),
      serverFiltered: describe({ symbolCount: 795, matchedCount: 1 }),
      unknown: describe({}),
      invalidCounts: ['', null, true, -1, 1.5, '3records', '<img>', Number.MAX_SAFE_INTEGER + 1]
        .map(value => describe({ matchedCount: value, symbolCount: value }).expectedCount),
    };
  });
  expect(result.preview).toEqual({ limited: true, preview: true, receivedCount: 1, availableCount: 1, expectedCount: 795 });
  expect(result.partial).toMatchObject({ limited: true, preview: false, expectedCount: 795 });
  expect(result.serverFiltered).toMatchObject({ limited: false, expectedCount: 1 });
  expect(result.unknown).toMatchObject({ limited: false, expectedCount: null });
  expect(result.invalidCounts).toEqual(Array(8).fill(null));
});

test('screener: preview warning follows results and qualifies social cards', async ({ page }, testInfo) => {
  await openScanner(page, () => preview);
  const notice = page.locator('#coverageNotice');
  await expect(notice).toBeHidden();
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .symbol')).toHaveText(['SOXL/USDT']);
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice).toContainText('Orion preview');
  await expect(notice).toContainText('Source records received: 8 of 795. USDT pairs available: 6.');
  await expect(page.locator('#heroStatusTitle')).toHaveText('1 setup found in preview');
  await expect(page.locator('#heroStatusDetail')).toContainText('Limited source coverage');
  await expect(page.locator('#resultsCount')).toHaveText('1 setup · preview');
  const captured = await page.evaluate(() => ({
    coverage: lastSuccessfulScanSnapshot.coverage,
    note: buildSocialCardPayloadFromState().note,
  }));
  expect(captured.coverage).toMatchObject({ limited: true, preview: true, receivedCount: 8, availableCount: 6, expectedCount: 795 });
  expect(captured.note).toContain('Limited Orion preview.');
  await page.locator('#filtersBtn').click();
  await page.locator('#maxResults').fill('100');
  await page.locator('#maxResults').blur();
  await expect(notice).toContainText('8 of 795');
  await page.locator('#rescanFiltersBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(1);
  await expect(notice).toContainText('8 of 795');
  await page.locator('#filtersBtn').click();
  await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/);
  await page.screenshot({ path: testInfo.outputPath('output/playwright/coverage-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => applyTheme(value, false), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await expect(notice).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('output/playwright/coverage-mobile-' + theme + '.png'), fullPage: true });
  }
});

test('screener: failed rescans preserve coverage; complete data clears it', async ({ page }) => {
  let payload = preview;
  await openScanner(page, () => payload);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#coverageNotice')).toBeVisible();
  const before = await page.evaluate(() => lastSuccessfulScanSnapshot);
  await page.evaluate(() => {
    window.originalScanRequest = fetchScreenerWithRetry;
    fetchScreenerWithRetry = async () => { throw new Error('Fixture unavailable'); };
  });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#coverageNotice')).toContainText('8 of 795');
  await expect(page.locator('#resultsList .symbol')).toHaveText(['SOXL/USDT']);
  expect(await page.evaluate(() => lastSuccessfulScanSnapshot)).toEqual(before);
  await page.evaluate(() => { fetchScreenerWithRetry = window.originalScanRequest; });
  payload = { access: 'full', symbolCount: 1, matchedCount: 1, tickers: [ticker('SAFEUSDT')] };
  await page.locator('#retryScanBtn').click();
  await expect(page.locator('#resultsList .symbol')).toHaveText(['SAFE/USDT']);
  await expect(page.locator('#coverageNotice')).toBeHidden();
  await expect(page.locator('#heroStatusTitle')).toHaveText('1 setup found');
  await expect(page.locator('#resultsCount')).not.toContainText('limited');
  expect(await page.evaluate(() => buildSocialCardPayloadFromState().note)).not.toContain('Limited Orion preview');
});

test('screener: empty preview matches keep the coverage warning visible', async ({ page }) => {
  let payload = preview;
  await openScanner(page, () => payload);
  await page.locator('#filtersBtn').click();
  await page.locator('#minVolatility').fill('5');
  await page.locator('#minVolatility').blur();
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(0);
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#emptyMessage')).toHaveText('No setups match within the available source data');
  await expect(page.locator('#heroStatusTitle')).toHaveText('No setups found in preview');
  await expect(page.locator('#coverageNotice')).toContainText('8 of 795');
  payload = { ...preview, tickers: [] };
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  await expect(page.locator('#coverageNotice')).toContainText('Source records received: 0 of 795. USDT pairs available: 0.');
});

test('screener: proxy wrappers retain preview access metadata', async ({ page }) => {
  const { tickers, ...metadata } = preview;
  await page.route('https://proxy.example/**', (route) => route.fulfill({ json: {
    ...metadata, data: { tickers },
  } }));
  await page.goto('./');
  await page.evaluate(() => {
    fetchScreener = fetchOrionScreener;
    chartSettings.enabled = false;
    markDirectApiBlocked();
    applyCorsProxies([{ url: 'https://proxy.example/?url=', encode: true }], false);
  });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .symbol')).toHaveText(['SOXL/USDT']);
  await expect(page.locator('#coverageNotice')).toContainText('Orion preview');
  await expect(page.locator('#coverageNotice')).toContainText('Source records received: 8 of 795. USDT pairs available: 6.');
});

test('screener: partial data without preview access is still labelled', async ({ page }) => {
  await openScanner(page, () => ({ access: 'full', symbolCount: 795, tickers: [ticker('SAFEUSDT')] }));
  await page.locator('#scanBtn').click();
  await expect(page.locator('#coverageNotice')).toContainText('Partial source data');
  await expect(page.locator('#coverageNotice')).toContainText('1 of 795');
  await expect(page.locator('#heroStatusTitle')).toHaveText('1 setup found in partial data');
  await expect(page.locator('#resultsCount')).toHaveText('1 setup · partial data');
  expect(await page.evaluate(() => buildSocialCardPayloadFromState().note)).toContain('Partial source data.');
});

test('screener: explicit preview stays labelled without valid counts or with all advertised rows', async ({ page }) => {
  let payload = { access: 'preview', matchedCount: '<img src=x>', tickers: [ticker('SAFEUSDT')] };
  await openScanner(page, () => payload);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#coverageNotice')).toContainText('Orion preview');
  await expect(page.locator('#coverageNotice')).toContainText('Source records received: 1. USDT pairs available: 1.');
  await expect(page.locator('#coverageNotice img')).toHaveCount(0);
  payload = { access: 'preview', matchedCount: 1, symbolCount: 1, tickers: [ticker('SAFEUSDT')] };
  await page.locator('#scanBtn').click();
  await expect(page.locator('#coverageNotice')).toContainText('1 of 1');
  await expect(page.locator('#coverageNotice')).toContainText('Orion preview');
});

test('screener: complete feeds can return 100 results without a preview warning', async ({ page }) => {
  const tickers = Array.from({ length: 500 }, (_, index) => ticker('ASSET' + index + 'USDT'));
  await openScanner(page, () => ({ tickers, symbolCount: 500, matchedCount: 500 }));
  await page.locator('#filtersBtn').click();
  await page.locator('#maxResults').fill('100');
  await page.locator('#maxResults').blur();
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(100);
  await expect(page.locator('#coverageNotice')).toBeHidden();
  await expect(page.locator('#heroStatusTitle')).toHaveText('100 setups found');
});
