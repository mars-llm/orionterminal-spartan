const { test, expect } = require('./coverage.fixture');

test.skip(!!process.env.E2E_BASE_URL, 'Deterministic direct Binance integration');
const STEP = 300000;
const CUTOFF = Math.floor(Date.now() / STEP) * STEP;
const market = (symbol) => ({ symbol, baseAsset: symbol.replace(/USDT$/, ''), quoteAsset: 'USDT', marginAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' });
const daily = (symbol, volume = 2000000) => ({ symbol, lastPrice: '100', quoteVolume: String(volume), priceChangePercent: '2' });
const candles = (cutoff = CUTOFF) => Array.from({ length: 48 }, (_, index) => {
  const time = cutoff - (48 - index) * STEP;
  return [time, '100', '101', '99', '100', '20', time + STEP - 1, '2000', 600];
});

async function setup(page, { symbols = ['ALPHAUSDT', 'BRAVOUSDT'], badCandle, infoStatus = 200, rateLimit = false } = {}) {
  const state = { klines: 0, globals: 0, active: 0, peak: 0, clock: CUTOFF + 1000, badCandle, rateLimit, blocked: false };
  await page.route('https://fapi.binance.com/fapi/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/klines')) {
      state.klines += 1;
      state.active += 1;
      state.peak = Math.max(state.peak, state.active);
      try {
        await new Promise(resolve => setTimeout(resolve, 4));
        if (url.searchParams.get('symbol') === state.badCandle) return await route.fulfill({ status: 502, json: { message: 'Fixture error' } });
        return await route.fulfill({ json: candles(Number(url.searchParams.get('endTime')) + 1) });
      } finally { state.active -= 1; }
    }
    state.globals += 1;
    if (state.blocked) return route.fulfill({ status: 451, json: {} });
    if (state.rateLimit) return route.fulfill({ status: 429, headers: { 'Retry-After': '180', 'Access-Control-Expose-Headers': 'Retry-After' }, json: {} });
    if (url.pathname.endsWith('/exchangeInfo')) return route.fulfill({ status: infoStatus, json: { symbols: symbols.map(market) } });
    if (url.pathname.endsWith('/time')) return route.fulfill({ json: { serverTime: state.clock } });
    if (url.pathname.endsWith('/ticker/24hr')) return route.fulfill({ json: symbols.map(symbol => daily(symbol)) });
    throw new Error('Unexpected Binance endpoint');
  });
  await page.goto('./');
  await page.evaluate(() => { chartSettings.enabled = false; });
  return state;
}

test('Binance: primary scan covers hundreds of markets, respects concurrency, and reuses closed candles', async ({ page }, testInfo) => {
  let orionRequests = 0;
  await page.route('https://screener.orionterminal.com/**', route => { orionRequests += 1; return route.abort(); });
  const state = await setup(page, { symbols: Array.from({ length: 220 }, (_, i) => 'ASSET' + i + 'USDT') });
  await page.locator('#filtersBtn').click();
  await page.locator('#maxResults').fill('100');
  await page.locator('#maxResults').blur();
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(100);
  await expect(page.locator('#scanBtn')).toBeEnabled();
  await expect(page.locator('#coverageNotice')).toBeHidden();
  await expect(page.locator('#heroStatusDetail')).toHaveText('Binance · 220 USDT perpetuals · 220 checked');
  expect(state.klines).toBe(220);
  expect(state.peak).toBeLessThanOrEqual(6);
  expect(orionRequests).toBe(0);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.klines).toBe(220);
  state.clock += STEP;
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.klines).toBe(440);
  await page.locator('#filtersBtn').click();
  await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/);
  await page.screenshot({ path: testInfo.outputPath('output/playwright/binance-full-scan.png'), fullPage: true });
});

test('Binance: metrics use exact closed 5m windows and ignore unfinished candles', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(({ rows, cutoff }) => {
    rows = rows.slice(-3);
    rows[0][2] = '105'; rows[1][3] = '95';
    rows[0][8] = 100; rows[1][8] = 200; rows[2][8] = 300;
    rows.push([cutoff, '100', '999', '1', '100', '20', cutoff + 299999, '2000', 999999]);
    return parseBinanceScanPick({ baseAsset: 'ALPHA' }, { lastPrice: '102', quoteVolume: '2000000', priceChangePercent: '2' }, rows, cutoff);
  }, { rows: candles(), cutoff: CUTOFF });
  expect(result.ticks5m).toBe(300);
  expect(result.ticks15m).toBe(600);
  expect(result.volatility15m).toBeCloseTo((105 / 95 - 1) * 100, 8);
  expect(result.priceChange1h).toBeNull();
  expect(result.priceChange4h).toBeNull();
  expect(result.volume24h).toBe(2000000);
});

test('Binance: a failed symbol is labelled incomplete and retried without replaying successful requests', async ({ page }) => {
  const state = await setup(page, { symbols: ['ALPHAUSDT', 'BRAVOUSDT', 'CHARLIEUSDT'], badCandle: 'BRAVOUSDT' });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
  await expect(page.locator('#coverageNotice')).toContainText('2 of 3 eligible markets loaded');
  expect(await page.evaluate(() => buildSocialCardPayloadFromState().note)).toContain('Partial source data');
  state.badCandle = null;
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(3);
  await expect(page.locator('#coverageNotice')).toBeHidden();
  expect(state.klines).toBe(4);
});

test('Binance: region blocks preserve old results and never trigger a proxy or Orion fallback', async ({ page }) => {
  const state = await setup(page);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
  const snapshot = await page.evaluate(() => lastSuccessfulScanSnapshot);
  state.blocked = true;
  await page.locator('#scanBtn').click();
  await expect(page.locator('#error')).toContainText('blocked in this region or network');
  expect(await page.evaluate(() => lastSuccessfulScanSnapshot)).toEqual(snapshot);
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(2);
});

test('Binance: rate limits stop immediately and honor Retry-After before another scan', async ({ page }) => {
  const state = await setup(page, { rateLimit: true });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#error')).toContainText('request limit reached');
  expect(await page.evaluate(() => binanceScanBlockedUntil - Date.now())).toBeGreaterThan(170000);
  const count = state.globals;
  await page.locator('#retryScanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.globals).toBe(count);
  expect(state.klines).toBe(0);
});

test('Binance: inactive, delivery and USDC contracts never enter the scan', async ({ page }) => {
  await setup(page);
  await page.route('**/fapi/v1/exchangeInfo', route => route.fulfill({ json: { symbols: [
    market('ALPHAUSDT'), { ...market('BRAVOUSDT'), status: 'SETTLING' },
    { ...market('DELIVERYUSDT'), contractType: 'CURRENT_QUARTER' },
    { ...market('BTCUSDT'), symbol: 'BTCUSDC', quoteAsset: 'USDC', marginAsset: 'USDC' },
  ] } }));
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .symbol')).toHaveText(['ALPHA/USDT']);
  expect(await page.evaluate(() => lastSuccessfulScanSnapshot.coverage.universeCount)).toBe(1);
});

test('Binance: malformed global payloads fail instead of showing a successful empty market', async ({ page }) => {
  await setup(page);
  await page.route('**/fapi/v1/ticker/24hr', route => route.fulfill({ json: { error: 'maintenance' } }));
  await page.locator('#scanBtn').click();
  await expect(page.locator('#error')).toContainText('incomplete market data');
  expect(await page.evaluate(() => lastSuccessfulScanSnapshot)).toBeNull();
});

test('Binance: expired deadlines launch no market requests', async ({ page }) => {
  const state = await setup(page);
  const name = await page.evaluate(async () => {
    try { await fetchScreener(Date.now() - 1); return ''; } catch (error) { return error.name; }
  });
  expect(name).toBe('TimeoutError');
  expect(state.globals).toBe(0);
});

test('Binance: missing or invalid daily rows are not reported as a successful empty scan', async ({ page }) => {
  const state = await setup(page);
  await page.route('**/fapi/v1/ticker/24hr', route => route.fulfill({ json: [
    { ...daily('ALPHAUSDT'), lastPrice: 'not-a-price' }, daily('UNRELATEDUSDT'),
  ] }));
  await page.locator('#scanBtn').click();
  await expect(page.locator('#error')).toContainText('incomplete market data');
  expect(await page.evaluate(() => lastSuccessfulScanSnapshot)).toBeNull();
  expect(state.klines).toBe(0);
});
