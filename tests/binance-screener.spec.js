const { test, expect } = require('./coverage.fixture');

test.skip(!!process.env.E2E_BASE_URL, 'Deterministic direct Binance integration');
const STEP = 300000;
const CUTOFF = Math.floor(Date.now() / STEP) * STEP;
const market = (symbol) => ({ symbol, baseAsset: symbol.replace(/USDT$/, ''), quoteAsset: 'USDT', marginAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' });
const daily = (symbol, volume = 2000000) => ({ symbol, lastPrice: '100', quoteVolume: String(volume), priceChangePercent: '2', count: 100000 });
const candles = (cutoff = CUTOFF) => Array.from({ length: 48 }, (_, index) => {
  const time = cutoff - (48 - index) * STEP;
  return [time, '100', '101', '99', '100', '20', time + STEP - 1, '2000', 600];
});

async function setup(page, { symbols = ['ALPHAUSDT', 'BRAVOUSDT'], badCandle, infoStatus = 200, rateLimit = false } = {}) {
  const state = { klines: 0, globals: 0, active: 0, peak: 0, clock: CUTOFF + 1000, badCandle, rateLimit, blocked: false,
    tickers: symbols.map(symbol => daily(symbol)), candleRows: {}, requestedSymbols: [], chartKlines: 0, extras: 0, candleDelay: 4 };
  await page.route('https://fapi.binance.com/fapi/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/klines')) {
      state.klines += 1;
      if (!url.searchParams.has('endTime')) state.chartKlines += 1;
      state.requestedSymbols.push(url.searchParams.get('symbol'));
      state.active += 1;
      state.peak = Math.max(state.peak, state.active);
      try {
        await new Promise(resolve => setTimeout(resolve, state.candleDelay));
        if (url.searchParams.get('symbol') === state.badCandle) return await route.fulfill({ status: 502, json: { message: 'Fixture error' } });
        return await route.fulfill({ json: state.candleRows[url.searchParams.get('symbol')] ||
          candles(url.searchParams.has('endTime') ? Number(url.searchParams.get('endTime')) + 1 : CUTOFF) });
      } finally { state.active -= 1; }
    }
    if (/\/(premiumIndex|openInterest)$/.test(url.pathname)) {
      state.extras += 1;
      if (state.rateLimit) return route.fulfill({ status: 429, headers: { 'Retry-After': '180', 'Access-Control-Expose-Headers': 'Retry-After' }, json: {} });
      return route.fulfill({ json: url.pathname.endsWith('/premiumIndex')
        ? { markPrice: '100', indexPrice: '100', lastFundingRate: '0.0001', nextFundingTime: CUTOFF + STEP }
        : { openInterest: '1000' } });
    }
    state.globals += 1;
    if (state.blocked) return route.fulfill({ status: 451, json: {} });
    if (state.rateLimit) return route.fulfill({ status: 429, headers: { 'Retry-After': '180', 'Access-Control-Expose-Headers': 'Retry-After' }, json: {} });
    if (url.pathname.endsWith('/exchangeInfo')) return route.fulfill({ status: infoStatus, json: { symbols: symbols.map(market) } });
    if (url.pathname.endsWith('/time')) return route.fulfill({ json: { serverTime: state.clock } });
    if (url.pathname.endsWith('/ticker/24hr')) return route.fulfill({ json: state.tickers });
    throw new Error('Unexpected Binance endpoint');
  });
  await page.goto('./');
  await page.evaluate(() => { chartSettings.enabled = false; });
  return state;
}

async function enablePreviewHarness(page) {
  await page.evaluate(() => {
    chartSettings.enabled = true;
    ensureChartLibraryLoaded = async () => ({});
    window.__renderedCharts = [];
    createChart = () => {
      chartInstance = { resize() {}, timeScale: () => ({ fitContent() {} }) };
      chartCandleSeries = { setData: data => window.__renderedCharts.push(data.length),
        createPriceLine: () => ({}), removePriceLine() {} };
      return chartInstance;
    };
  });
}

test('Binance: brief card hover starts no chart, funding or open-interest requests', async ({ page }) => {
  const state = await setup(page, { symbols: Array.from({ length: 20 }, (_, i) => 'ASSET' + i + 'USDT') });
  await enablePreviewHarness(page);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  await page.evaluate(() => {
    const card = document.querySelector('.pick-card');
    handleCardMouseEnter(picks[0].symbol, card);
    handleCardMouseLeave();
  });
  await page.waitForTimeout(400);
  expect(state.extras).toBe(0);
  expect(state.chartKlines).toBe(0);
  expect(state.globals + state.klines).toBe(23);
});

test('Binance: after a cold scan all ten previews are lazy, use one request each and reuse cached candles', async ({ page }) => {
  const state = await setup(page, { symbols: Array.from({ length: 20 }, (_, i) => 'ASSET' + i + 'USDT') });
  await enablePreviewHarness(page);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.klines + state.globals).toBe(23);
  const symbols = await page.evaluate(() => picks.map(pick => pick.symbol));
  for (const symbol of symbols) {
    await page.evaluate(async symbol => {
      const card = [...document.querySelectorAll('.pick-card')].find(card => card.querySelector('.symbol').textContent === symbol);
      await showChartPreview(symbol, card);
    }, symbol);
    await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
    await page.evaluate(() => closeChartPreview());
  }
  expect(state.chartKlines).toBe(10);
  expect(state.extras).toBe(0);
  expect(await page.evaluate(() => window.__renderedCharts.length)).toBe(10);
  for (const symbol of symbols) {
    await page.evaluate(async symbol => { await showChartPreview(symbol, document.querySelector('.pick-card')); closeChartPreview(); }, symbol);
  }
  expect(state.chartKlines).toBe(10);
});

test('Binance: expanded details start after candles and never duplicate pending extras', async ({ page }) => {
  const state = await setup(page);
  await enablePreviewHarness(page);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  await page.evaluate(async () => { isChartMaximized = true; await showChartPreview(picks[0].symbol, document.querySelector('.pick-card')); });
  await expect(page.locator('#chartPreviewStats')).toContainText('Funding');
  await expect(page.locator('#chartPreviewStats')).not.toContainText('Loading');
  expect(state.chartKlines).toBe(1);
  expect(state.extras).toBe(2);
  await page.evaluate(async () => {
    dataCache.delete(getFuturesExtrasCacheKey(getCleanSymbol(picks[0].symbol)));
    await Promise.all([getFuturesExtras(picks[0].symbol), getFuturesExtras(getCleanSymbol(picks[0].symbol))]);
  });
  expect(state.extras).toBe(4);
});

test('Binance: a pending hover cannot replace an explicitly expanded chart', async ({ page }) => {
  const state = await setup(page);
  await enablePreviewHarness(page);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  const intended = await page.evaluate(async () => {
    const cards = document.querySelectorAll('.pick-card');
    chartSettings.hoverDelay = 150;
    handleCardMouseEnter(picks[0].symbol, cards[0]);
    isChartMaximized = true;
    await showChartPreview(picks[1].symbol, cards[1]);
    handleCardMouseEnter(picks[0].symbol, cards[0]);
    return picks[1].symbol;
  });
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => currentPreviewSymbol)).toBe(intended);
  expect(state.chartKlines).toBe(1);
  expect(state.extras).toBe(2);
});

test('Binance: an old mouse-leave callback cannot hide a newly opened chart', async ({ page }) => {
  await setup(page);
  await enablePreviewHarness(page);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  await page.evaluate(async () => {
    const cards = document.querySelectorAll('.pick-card');
    await showChartPreview(picks[0].symbol, cards[0]);
    handleCardMouseLeave();
    await showChartPreview(picks[1].symbol, cards[1]);
  });
  await page.waitForTimeout(200);
  await expect(page.locator('#chartPreview')).toHaveClass(/visible/);
  await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
});

test('Binance: identical candle requests share work while cancellation only detaches its caller', async ({ page }) => {
  const state = await setup(page);
  const results = await page.evaluate(async () => {
    const a = new AbortController(), b = new AbortController();
    const first = fetchChartCandles('ALPHA/USDT', '1m', 100, a.signal);
    const second = fetchChartCandles('ALPHA/USDT', '1m', 100, b.signal);
    a.abort();
    const outcome = await Promise.allSettled([first, second]);
    return outcome.map(result => result.status === 'fulfilled' ? result.value.candles.length : result.reason.name);
  });
  expect(results).toEqual(['AbortError', 48]);
  expect(state.chartKlines).toBe(1);
  await expect.poll(() => page.evaluate(() => pendingMarketRequests.size)).toBe(0);
});

test('Binance: cancelling all subscribers before dispatch sends nothing and permits a later retry', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(async () => {
    const controller = new AbortController();
    const first = fetchChartCandles('ALPHA/USDT', '1m', 100, controller.signal);
    controller.abort();
    await first.catch(() => null);
  });
  expect(state.chartKlines).toBe(0);
  await page.evaluate(() => fetchChartCandles('ALPHA/USDT', '1m', 100));
  expect(state.chartKlines).toBe(1);
});

test('Binance: a failed shared request is removed so the next attempt can recover', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    let attempts = 0;
    try { await shareMarketRequest('fixture-retry', null, () => { attempts += 1; throw new Error('Fixture failure'); }); } catch {}
    const value = await shareMarketRequest('fixture-retry', null, () => { attempts += 1; return 42; });
    return { attempts, value, pending: pendingMarketRequests.size };
  });
  expect(result).toEqual({ attempts: 2, value: 42, pending: 0 });
});

test('Binance: optional details preserve twenty candle slots and scan requests cannot use them', async ({ page }) => {
  const state = await setup(page);
  const result = await page.evaluate(async () => {
    // Simulate thirty already dispatched scan requests in this rolling minute.
    binanceRequestTimes = Array.from({ length: 30 }, () => Date.now());
    binanceScanRequestTimes = binanceRequestTimes.slice();
    saveBinanceBudget();
    let scanBlocked = false;
    try { await fetchBinanceScanJson('time', null, Date.now() + 1000); } catch (error) { scanBlocked = error.isLocalBudget; }
    for (let i = 0; i < 10; i += 1) await fetchJsonOrThrow(getBinanceFuturesPremiumIndexUrl('ALPHAUSDT'));
    let optionalBlocked = false;
    try { await fetchJsonOrThrow(getBinanceFuturesPremiumIndexUrl('ALPHAUSDT')); } catch (error) { optionalBlocked = error.isLocalBudget; }
    for (let i = 0; i < 20; i += 1) await fetchChartCandles('RESERVE' + i + '/USDT', '1m', 100);
    return { scanBlocked, optionalBlocked };
  });
  expect(result).toEqual({ scanBlocked: true, optionalBlocked: true });
  expect(state.globals).toBe(0);
  expect(state.extras).toBe(10);
  expect(state.chartKlines).toBe(20);
});

test('Binance: a 500-market universe needs at most 23 requests, immediate repeats need zero', async ({ page }, testInfo) => {
  await page.clock.install({ time: CUTOFF + 1000 });
  let orionRequests = 0;
  await page.route('https://screener.orionterminal.com/**', route => { orionRequests += 1; return route.abort(); });
  const state = await setup(page, { symbols: Array.from({ length: 500 }, (_, i) => 'ASSET' + i + 'USDT') });
  await page.evaluate(() => { chartSettings.enabled = true; });
  await page.locator('#filtersBtn').click();
  await page.locator('#maxResults').fill('100');
  await page.locator('#maxResults').blur();
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .pick-card')).toHaveCount(20);
  await expect(page.locator('#scanBtn')).toBeEnabled();
  await expect(page.locator('#coverageNotice')).toContainText('Selected up to 20 of 500 matching markets');
  await expect(page.locator('#heroStatusDetail')).toHaveText('Binance · 20 checked · shortlist: mixed signals');
  expect(state.klines).toBe(20);
  expect(state.globals).toBe(3);
  expect(state.peak).toBeLessThanOrEqual(2);
  expect(orionRequests).toBe(0);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.klines).toBe(20);
  expect(state.globals).toBe(3);
  state.clock += STEP;
  await page.clock.fastForward(STEP);
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.klines).toBe(40);
  expect(state.globals).toBe(5);
  await page.locator('#filtersBtn').click();
  await page.clock.fastForward(4000);
  await page.screenshot({ path: testInfo.outputPath('output/playwright/binance-focused-scan.png') });
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
  await page.evaluate(() => { binanceSummaryCache = null; });
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

test('Binance: every built-in preset applies its volume, activity and exclusion thresholds', async ({ page }) => {
  const state = await setup(page, { symbols: ['LOWUSDT', 'MIDUSDT', 'EDGEUSDT', 'LIQUIDUSDT', 'BTCUSDT', 'QUIETUSDT'] });
  const config = [ ['LOW', 100000, 1000], ['MID', 1000000, 600], ['EDGE', 10000000, 200],
    ['LIQUID', 50000000, 800], ['BTC', 100000000, 1000], ['QUIET', 2000000, 40] ];
  state.tickers = config.map(([base, volume]) => daily(base + 'USDT', volume));
  for (const [base, , trades] of config) state.candleRows[base + 'USDT'] = candles().map(row => { row[8] = trades; return row; });
  await page.locator('#filtersBtn').click();
  for (const [name, expected] of [ ['Default', ['EDGE', 'LIQUID', 'MID']], ['High Volume Majors', ['BTC', 'LIQUID']],
    ['Lower Volume', ['EDGE', 'LOW', 'MID']], ['Scalping', ['LIQUID', 'MID']] ]) {
    await page.getByRole('button', { name, exact: false }).filter({ has: page.locator('.preset-badge') }).click();
    await page.locator('#scanBtn').click();
    await expect(page.locator('#scanBtn')).toBeEnabled();
    await expect(page.locator('#error')).toBeHidden();
    expect((await page.locator('#resultsList .symbol').allTextContents()).map(text => text.split('/')[0]).sort()).toEqual(expected.sort());
  }
  await expect(page.locator('#marketSort')).toHaveValue('activity');
  expect(state.globals).toBe(3);
  expect(state.klines).toBe(6);
});

test('Binance: volume bounds, all postfilters, exclusions and result limit apply without re-fetching candles', async ({ page }) => {
  const state = await setup(page, { symbols: ['ALPHAUSDT', 'BRAVOUSDT', 'CHARLIEUSDT'] });
  state.tickers = [daily('ALPHAUSDT', 1000000), daily('BRAVOUSDT', 2000000), daily('CHARLIEUSDT', 3000000)];
  const run = async filters => {
    const symbols = await page.evaluate(async filters => {
      const next = sanitizeFilterState({ ...DEFAULT_FILTERS, excludeSymbols: [], ...filters });
      return (await fetchScreener(undefined, next)).map(pick => pick.symbol);
    }, filters);
    return symbols.sort();
  };
  expect(await run({ minVolume: 1000000, maxVolume: 2000000 })).toEqual(['ALPHA/USDT', 'BRAVO/USDT']);
  expect(state.requestedSymbols.sort()).toEqual(['ALPHAUSDT', 'BRAVOUSDT']);
  expect(await run({ minVolume: 3000000, maxVolume: 3000000 })).toEqual(['CHARLIE/USDT']);
  expect(await run({ minTicks5m: 601 })).toEqual([]);
  expect(await run({ minTicks5m: 600, minVolatility15m: 3 })).toEqual([]);
  expect(await run({ minTicks5m: 600, minVolatility15m: 2 })).toHaveLength(3);
  expect(await run({ excludeSymbols: ['BRAVO'], maxResults: 1 })).toHaveLength(1);
  expect(await run({ includeSymbols: ['ALPHA', 'BRAVO'], excludeSymbols: ['ALPHA'] })).toEqual(['BRAVO/USDT']);
  expect(state.klines).toBe(3);
  expect(state.globals).toBe(3);
});

test('Binance: activity shortlist uses real 24h trade counts, never an inferred 5m average', async ({ page }) => {
  const symbols = Array.from({ length: 30 }, (_, i) => 'ASSET' + i + 'USDT');
  const state = await setup(page, { symbols });
  state.tickers = symbols.map((symbol, i) => ({ ...daily(symbol, (i + 1) * 1000000), count: 100000 - i * 1000 }));
  // A low 24h count cannot meet a higher 5m count; a low average can still have a burst.
  state.tickers[0].count = 500;
  state.tickers[1].count = 499;
  await page.evaluate(() => { currentFilters = sanitizeFilterState({ ...DEFAULT_FILTERS, marketSort: 'activity', minTicks5m: 500 }); });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.requestedSymbols).not.toContain('ASSET1USDT');
  expect(state.requestedSymbols).not.toContain('ASSET0USDT'); // Falls outside the 20 most-traded eligible markets.
  expect(state.requestedSymbols).toContain('ASSET2USDT');
  await page.evaluate(() => { currentFilters.includeSymbols = ['ASSET0']; });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .symbol')).toHaveText(['ASSET0/USDT']);
  expect(state.klines).toBe(21);
});

test('Binance: changing to an uncached shortlist does not start a batch beyond the minute budget', async ({ page }) => {
  const state = await setup(page, { symbols: Array.from({ length: 100 }, (_, i) => 'ASSET' + String(i).padStart(2, '0') + 'USDT') });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  const snapshot = await page.evaluate(() => lastSuccessfulScanSnapshot);
  await page.evaluate(() => { currentFilters.includeSymbols = Array.from({ length: 20 }, (_, i) => 'ASSET' + (80 + i)); });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#error')).toContainText('Local Binance request budget reached');
  expect(state.klines).toBe(20);
  expect(state.globals).toBe(3);
  expect(await page.evaluate(() => lastSuccessfulScanSnapshot)).toEqual(snapshot);
});

test('Binance: transport budget includes charts and proxies, survives reload and is shared by tabs', async ({ page, context }) => {
  const state = await setup(page);
  const consume = count => page.evaluate(async count => Promise.allSettled(Array.from({ length: count }, () =>
    fetchJsonOrThrow(getBinanceFuturesUrl('BUDGETUSDT', '1m', 100)))), count);
  await consume(59);
  const second = await context.newPage();
  await second.route('https://fapi.binance.com/fapi/v1/klines**', route => { state.klines += 1; return route.fulfill({ json: candles() }); });
  await second.goto('./');
  await Promise.all([consume(1), second.evaluate(() => fetchJsonOrThrow(getBinanceFuturesUrl('BUDGETUSDT', '1m', 100)).catch(() => null))]);
  expect(state.klines).toBe(60);
  let proxyRequests = 0;
  await page.route('https://budget-proxy.example/**', route => { proxyRequests += 1; return route.fulfill({ json: [] }); });
  const error = await page.evaluate(async () => {
    applyCorsProxies([{ url: 'https://budget-proxy.example/?url=', encode: true }], false);
    try { await fetchChartCandles('ALPHA/USDT', '1m', 3); return ''; } catch (error) { return error.message; }
  });
  expect(error).toContain('Local Binance request budget');
  expect(proxyRequests).toBe(0);
  await page.reload();
  await consume(1);
  expect(state.klines).toBe(60);
});

test('Binance: the minute budget recovers and blocked storage keeps the in-memory guard', async ({ page }) => {
  await page.clock.install({ time: CUTOFF + 1000 });
  const state = await setup(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === BINANCE_BUDGET_KEY) throw new Error('Fixture storage blocked');
      return original.call(this, key, value);
    };
  });
  const consume = () => page.evaluate(async () => {
    try { await fetchJsonOrThrow('https://fapi.binance.com/fapi/v1/time'); return true; } catch { return false; }
  });
  for (let i = 0; i < 30; i += 1) expect(await consume()).toBe(true);
  expect(await consume()).toBe(false);
  expect(state.globals).toBe(30);
  await page.clock.fastForward(60001);
  expect(await consume()).toBe(true);
  expect(state.globals).toBe(31);
});

test('Binance: specific symbols, custom presets and social-card v2 roundtrip retain the shortlist', async ({ page }) => {
  const state = await setup(page, { symbols: ['BTCUSDT', 'MIDUSDT', 'OTHERUSDT'] });
  await page.locator('#filtersBtn').click();
  await page.locator('#excludeSymbols').fill(''); await page.locator('#excludeSymbols').blur();
  await page.locator('#includeSymbols').fill('btcUSDT, MID/USDT, BTC'); await page.locator('#includeSymbols').blur();
  await page.locator('#marketSort').selectOption('activity');
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.requestedSymbols.sort()).toEqual(['BTCUSDT', 'MIDUSDT']);
  const saved = await page.evaluate(() => {
    createCustomProfile('Focused markets');
    const before = structuredClone(currentFilters);
    const payload = buildSocialCardPayloadFromState();
    const decoded = decodeCardPayload(encodeCardPayload(payload));
    const id = activeProfileId;
    selectProfile('default');
    selectProfile(id);
    return { before, restored: currentFilters, decoded: decoded.payload.filters, note: payload.note };
  });
  expect(saved.restored).toEqual(saved.before);
  expect(saved.decoded).toEqual(saved.before);
  expect(saved.before.includeSymbols).toEqual(['BTC', 'MID']);
  expect(saved.note).toContain('Binance shortlist: 2 markets');
  await page.reload();
  await page.locator('#filtersBtn').click();
  await page.getByRole('button', { name: 'Focused markets', exact: false }).filter({ has: page.locator('.custom-badge') }).click();
  await expect(page.locator('#includeSymbols')).toHaveValue('BTC, MID');
  await expect(page.locator('#marketSort')).toHaveValue('activity');
});

test('Binance: invalid or oversized symbol lists are blocked before any market request', async ({ page }) => {
  const state = await setup(page);
  await page.locator('#filtersBtn').click();
  for (const value of ['not a symbol', Array.from({ length: 21 }, (_, i) => 'ASSET' + i).join(',')]) {
    await page.locator('#includeSymbols').fill(value); await page.locator('#includeSymbols').blur();
    await page.locator('#scanBtn').click();
    expect(state.globals).toBe(0);
    expect(await page.locator('#includeSymbols').evaluate(input => input.checkValidity())).toBe(false);
  }
});

test('Binance: provider cooldown applies to chart extras and cannot be bypassed with proxies or reload', async ({ page }) => {
  const state = await setup(page, { rateLimit: true });
  let proxyRequests = 0;
  await page.route('https://cooldown-proxy.example/**', route => { proxyRequests += 1; return route.fulfill({ json: {} }); });
  const run = () => page.evaluate(async () => {
    applyCorsProxies([{ url: 'https://cooldown-proxy.example/?url=', encode: true }], false);
    try { await getFuturesExtras('ALPHA/USDT'); return ''; } catch (error) { return error.message; }
  });
  expect(await run()).toContain('Binance request limit reached');
  const count = state.globals + state.extras;
  await page.reload();
  expect(await run()).toContain('Binance request limit reached');
  expect(state.globals + state.extras).toBe(count);
  expect(proxyRequests).toBe(0);
});

test('Binance: metadata expires after ten minutes even with intervening scans', async ({ page }) => {
  await page.clock.install({ time: CUTOFF + 1000 });
  const state = await setup(page);
  for (const [advance, globals] of [[0, 3], [STEP, 5], [STEP, 8]]) {
    if (advance) {
      state.clock += advance;
      await page.clock.fastForward(advance);
    }
    await page.locator('#scanBtn').click();
    await expect(page.locator('#scanBtn')).toBeEnabled();
    await expect(page.locator('#error')).toBeHidden();
    expect(state.globals).toBe(globals);
  }
  const name = await page.evaluate(async () => {
    try { await fetchScreener(Date.now() - 1); return ''; } catch (error) { return error.name; }
  });
  expect(name).toBe('TimeoutError');
  expect(state.globals).toBe(8);
});

test('Binance: shortlist controls stay labelled and readable at desktop, tablet and phone widths', async ({ page }) => {
  await setup(page);
  await page.locator('#filtersBtn').click();
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel('Market shortlist')).toBeVisible();
    await expect(page.getByLabel('Only these symbols (optional)')).toBeVisible();
    const geometry = await page.locator('#marketSort').evaluate(select => ({ width: select.getBoundingClientRect().width,
      overflow: document.documentElement.scrollWidth > innerWidth }));
    expect(geometry.width).toBeGreaterThan(230);
    expect(geometry.overflow).toBe(false);
  }
});

test('Binance: batch retry waits for enough scan and shared slots, not just the oldest request', async ({ page }) => {
  await page.clock.install({ time: CUTOFF + 1000 });
  await setup(page);
  const result = await page.evaluate(() => {
    const now = Date.now();
    binanceScanRequestTimes = [...Array(10).fill(now - 50000), ...Array(20).fill(now - 10000)];
    binanceRequestTimes = [...binanceScanRequestTimes, ...Array(25).fill(now - 5000)].sort((a, b) => a - b);
    saveBinanceBudget();
    try { assertBinanceBudget(20, 'scan'); return ''; } catch (error) { return error.message; }
  });
  expect(result).toContain('Retry in 50s');
  await page.clock.fastForward(10001);
  expect(await page.evaluate(() => {
    try { assertBinanceBudget(20, 'scan'); return false; } catch (error) { return error.isLocalBudget; }
  })).toBe(true);
  await page.clock.fastForward(40000);
  expect(await page.evaluate(() => { assertBinanceBudget(20, 'scan'); return true; })).toBe(true);
});

test('Binance: a fresh fallback chart remains available when the shared network budget is full', async ({ page }) => {
  const state = await setup(page);
  const result = await page.evaluate(async () => {
    const rows = [{ time: 1710000000, open: 1, high: 2, low: 1, close: 2, volume: 10 }];
    setCachedData(getChartCacheKey('binance-spot', 'ALPHAUSDT', '1m', 100), rows, { source: 'binance-spot' });
    binanceRequestTimes = Array(60).fill(Date.now());
    saveBinanceBudget();
    try {
      const chart = await fetchChartCandles('ALPHA/USDT', '1m', 100);
      return { cached: chart.cached, source: chart.source.id, candles: chart.candles.length };
    } catch (error) { return { error: error.message }; }
  });
  expect(result).toEqual({ cached: true, source: 'binance-spot', candles: 1 });
  expect(state.klines + state.globals).toBe(0);
});

test('Binance: S/R requests share pending work across chart recreation and caller cancellation', async ({ page }) => {
  const state = await setup(page);
  state.candleDelay = 200;
  await page.evaluate(() => {
    window.__srCaller = new AbortController();
    window.__srFirst = fetchSRLevels('ALPHA/USDT', '1h', window.__srCaller.signal, CHART_SOURCES['binance-futures'])
      .catch(error => error.name);
  });
  await expect.poll(() => state.chartKlines).toBe(1);
  const result = await page.evaluate(async () => {
    const source = CHART_SOURCES['binance-futures'];
    const second = fetchSRLevels('ALPHA/USDT', '1h', null, source);
    window.__srCaller.abort();
    return [await window.__srFirst, (await second).length];
  });
  expect(result).toEqual(['AbortError', 2]);
  expect(state.chartKlines).toBe(1);
  await expect.poll(() => page.evaluate(() => pendingMarketRequests.size)).toBe(0);
});

test('Binance: twenty minutes of repeated scans and chart browsing stay usable within unchanged budgets', async ({ page }) => {
  test.setTimeout(90000);
  await page.clock.install({ time: CUTOFF + 1000 });
  const state = await setup(page, { symbols: Array.from({ length: 20 }, (_, i) => 'ASSET' + i + 'USDT') });
  await enablePreviewHarness(page);
  await page.evaluate(() => {
    window.__marketAudit = [];
    const original = window.fetch;
    window.fetch = function(url, options) {
      if (isBinanceRequest(url)) window.__marketAudit.push({ at: Date.now(), kind: getBinanceRequestKind(url) });
      return original.call(this, url, options);
    };
  });
  for (let minute = 0; minute <= 20; minute += 1) {
    if (minute) {
      state.clock += 60001;
      await page.clock.fastForward(60001);
    }
    await page.evaluate(async () => {
      await handleScan();
      await handleScan();
    });
    await expect(page.locator('#error')).toBeHidden();
    await expect(page.locator('#resultsList .pick-card')).toHaveCount(10);
    const beforeCharts = state.chartKlines;
    await page.evaluate(async () => {
      const card = document.querySelector('.pick-card');
      for (let pass = 0; pass < 2; pass += 1) for (const pick of picks) {
        await showChartPreview(pick.symbol, card);
        closeChartPreview();
      }
      isChartMaximized = true;
      await showChartPreview(picks[0].symbol, card);
    });
    await expect(page.locator('#chartPreviewStats')).not.toContainText('Loading');
    await expect(page.locator('#chartPreviewStats')).not.toContainText('Unavailable');
    await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
    expect(state.chartKlines - beforeCharts).toBe(10);
    await page.evaluate(() => closeChartPreview());
    await expect.poll(() => page.evaluate(() => pendingMarketRequests.size)).toBe(0);
  }
  expect(state.globals).toBe(45);
  expect(state.klines - state.chartKlines).toBe(100);
  expect(state.chartKlines).toBe(210);
  expect(state.extras).toBe(42);
  const peaks = await page.evaluate(() => window.__marketAudit.reduce((peaks, current) => {
    const windowRows = window.__marketAudit.filter(row => row.at <= current.at && row.at > current.at - 60000);
    return { all: Math.max(peaks.all, windowRows.length),
      scan: Math.max(peaks.scan, windowRows.filter(row => row.kind === 'scan').length) };
  }, { all: 0, scan: 0 }));
  expect(peaks.all).toBeLessThanOrEqual(35);
  expect(peaks.scan).toBeLessThanOrEqual(23);
});

test('Binance: rapid chart bursts render only the final selection and leave no pending work', async ({ page }) => {
  const state = await setup(page);
  await enablePreviewHarness(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    const card = document.getElementById('scanBtn');
    await Promise.all(Array.from({ length: 100 }, (_, i) => showChartPreview('BURST' + i + '/USDT', card)));
  });
  await expect(page.locator('#chartPreviewSymbol')).toHaveText('BURST99/USDT');
  await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
  expect(state.chartKlines).toBe(1);
  expect(state.extras).toBe(0);
  expect(await page.evaluate(() => window.__renderedCharts.length)).toBe(1);
  await page.evaluate(() => closeChartPreview());
  await expect.poll(() => page.evaluate(() => pendingMarketRequests.size)).toBe(0);
  expect(errors).toEqual([]);
});

test('Binance: competing tabs enforce scan, optional and shared ceilings over three recovered windows', async ({ page, context }) => {
  await page.clock.install({ time: CUTOFF + 1000 });
  const first = await setup(page);
  const secondPage = await context.newPage();
  await secondPage.clock.install({ time: CUTOFF + 1000 });
  const second = await setup(secondPage);
  const tabs = [page, secondPage];
  for (let minute = 0; minute < 3; minute += 1) {
    // Both tabs represent one system clock, not independently advancing test clocks.
    await Promise.all(tabs.map(tab => tab.clock.setFixedTime(CUTOFF + 1000 + minute * 60001)));
    await Promise.all(tabs.map(tab => tab.evaluate(async () => Promise.allSettled(Array.from({ length: 20 }, () =>
      fetchBinanceScanJson('time', null, Date.now() + 10000))))));
    expect(first.globals + second.globals).toBe(30 * (minute + 1));
    await Promise.all(tabs.map(tab => tab.evaluate(async () => Promise.allSettled(Array.from({ length: 20 }, () =>
      fetchJsonOrThrow(getBinanceFuturesPremiumIndexUrl('ALPHAUSDT')))))));
    expect(first.extras + second.extras).toBe(10 * (minute + 1));
    await Promise.all(tabs.map(tab => tab.evaluate(async () => Promise.allSettled(Array.from({ length: 20 }, () =>
      fetchJsonOrThrow(getBinanceFuturesUrl('ALPHAUSDT', '1m', 100)))))));
    expect(first.chartKlines + second.chartKlines).toBe(20 * (minute + 1));
  }
});

test('Binance: losing storage writes after a saved budget retains the in-memory limit and recovery', async ({ page }) => {
  await page.clock.install({ time: CUTOFF + 1000 });
  const state = await setup(page);
  await page.evaluate(() => {
    binanceRequestTimes = Array(25).fill(Date.now());
    saveBinanceBudget();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === BINANCE_BUDGET_KEY) throw new Error('Fixture quota exhausted');
      return original.call(this, key, value);
    };
  });
  const consume = () => page.evaluate(() => Promise.allSettled(Array.from({ length: 40 }, () =>
    fetchJsonOrThrow(getBinanceFuturesUrl('ALPHAUSDT', '1m', 100)))));
  await consume();
  expect(state.chartKlines).toBe(35);
  expect(await page.evaluate(() => binanceBudgetStorageAvailable)).toBe(false);
  await page.clock.fastForward(60001);
  await consume();
  expect(state.chartKlines).toBe(75);
});

function mixedUniverse() {
  return [
    ...Array.from({ length: 20 }, (_, i) => ({ ...daily('LIQUID' + i + 'USDT', 100000000 - i * 1000000),
      count: 50000, weightedAvgPrice: '100' })),
    ...Array.from({ length: 10 }, (_, i) => ({ ...daily('ACTIVE' + i + 'USDT', 5000000 - i * 10000),
      count: 1000000 - i * 10000, weightedAvgPrice: '100' })),
    ...Array.from({ length: 10 }, (_, i) => ({ ...daily('MOVER' + i + 'USDT', 1000000 - i * 1000),
      count: 40000, lastPrice: String(100 + (i % 2 ? -1 : 1) * (20 + i)), weightedAvgPrice: '100' })),
  ];
}

test('Binance: mixed selection reserves distinct liquidity, activity and current VWAP-movement slots', async ({ page }) => {
  const state = await setup(page);
  const rows = mixedUniverse();
  const expected = [...Array.from({ length: 8 }, (_, i) => 'LIQUID' + i + 'USDT'),
    ...Array.from({ length: 6 }, (_, i) => 'ACTIVE' + i + 'USDT'),
    ...[9, 8, 7, 6, 5, 4].map(i => 'MOVER' + i + 'USDT')];
  const result = await page.evaluate(rows => {
    const markets = rows.map(row => ({ symbol: row.symbol }));
    const bySymbol = new Map(rows.map(row => [row.symbol, row]));
    const original = JSON.stringify({ markets, rows });
    const select = input => selectBinanceScanMarkets(input, bySymbol, 'mixed').map(market => market.symbol);
    const selected = select(markets);
    const permutations = [markets.slice().reverse(), markets.slice(13).concat(markets.slice(0, 13)),
      markets.slice(0, 10).reverse().concat(markets.slice(10))].map(select);
    const scaled = new Map(rows.map(row => [row.symbol, { ...row,
      lastPrice: String(Number(row.lastPrice) * 1e-6), weightedAvgPrice: String(Number(row.weightedAvgPrice) * 1e-6) }]));
    return { selected, permutations, unchanged: JSON.stringify({ markets, rows }) === original,
      volume: selectBinanceScanMarkets(markets, bySymbol, 'volume').map(market => market.symbol),
      activity: selectBinanceScanMarkets(markets, bySymbol, 'activity').map(market => market.symbol),
      scaled: selectBinanceScanMarkets(markets, scaled, 'mixed').map(market => market.symbol) };
  }, rows);
  expect(result.selected).toEqual(expected);
  expect(result.permutations).toEqual([expected, expected, expected]);
  expect(new Set(result.selected).size).toBe(20);
  expect(result.unchanged).toBe(true);
  expect(result.volume).toEqual(Array.from({ length: 20 }, (_, i) => 'LIQUID' + i + 'USDT'));
  expect(result.activity).toEqual([...Array.from({ length: 10 }, (_, i) => 'ACTIVE' + i + 'USDT'),
    ...Array.from({ length: 10 }, (_, i) => 'LIQUID' + i + 'USDT')]);
  expect(result.scaled).toEqual(expected);
  expect(state.globals + state.klines).toBe(0);
});

test('Binance: mixed lanes skip invalid auxiliary data, deduplicate overlap and fill sparse pools by volume', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(rows => {
    const overlapping = rows.slice(0, 20).map((row, i) => ({ ...row, count: 1000000 - i,
      lastPrice: String(150 - i), weightedAvgPrice: '100' }));
    const invalid = rows.slice(0, 25).map((row, i) => ({ ...row, count: [undefined, 'invalid', -1, 1.5, Infinity][i % 5],
      weightedAvgPrice: [undefined, { toString: 'not-callable' }, [1], '-1', '1e-320'][i % 5], priceChangePercent: '999999' }));
    const run = data => selectBinanceScanMarkets(data.map(row => ({ symbol: row.symbol })),
      new Map(data.map(row => [row.symbol, row])), 'mixed').map(row => row.symbol);
    const tied = Array.from({ length: 30 }, (_, i) => ({ symbol: 'TIE' + String(i).padStart(2, '0') + 'USDT',
      quoteVolume: '1000000', count: 1000, lastPrice: '100', weightedAvgPrice: '100' }));
    return { overlapping: run(overlapping), invalid: run(invalid), small: run(invalid.slice(0, 5)),
      empty: run([]), ties: run(tied), reversedTies: run(tied.slice().reverse()) };
  }, mixedUniverse());
  const liquid = Array.from({ length: 20 }, (_, i) => 'LIQUID' + i + 'USDT');
  expect(result.overlapping).toEqual(liquid);
  expect(result.invalid).toEqual(liquid);
  expect(result.small).toEqual(liquid.slice(0, 5));
  expect(result.empty).toEqual([]);
  expect(result.ties).toEqual(Array.from({ length: 20 }, (_, i) => 'TIE' + String(i).padStart(2, '0') + 'USDT'));
  expect(result.reversedTies).toEqual(result.ties);
});

test('Binance: a mixed cold scan still uses only 23 requests and preserves prefilters and cached repeats', async ({ page }) => {
  await page.clock.install({ time: CUTOFF + 1000 });
  const rows = [...mixedUniverse(),
    { ...daily('BTCUSDT', 1000000000), count: 9000000, lastPrice: '500', weightedAvgPrice: '100' },
    { ...daily('ILLIQUIDUSDT', 499999), count: 9000000, lastPrice: '500', weightedAvgPrice: '100' },
    { ...daily('UNVERIFIEDUSDT', 1000000), count: 500, priceChangePercent: '999999', weightedAvgPrice: { toString: 'not-callable' } }];
  const state = await setup(page, { symbols: rows.map(row => row.symbol) });
  state.tickers = rows;
  await page.evaluate(() => { currentFilters = { ...DEFAULT_FILTERS, maxResults: 100 }; });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  await expect(page.locator('#error')).toBeHidden();
  expect(state.requestedSymbols.slice(0, 8).sort()).toEqual(Array.from({ length: 8 }, (_, i) => 'LIQUID' + i + 'USDT').sort());
  expect(state.requestedSymbols.filter(symbol => symbol.startsWith('ACTIVE'))).toHaveLength(6);
  expect(state.requestedSymbols.filter(symbol => symbol.startsWith('MOVER')).sort()).toEqual([4, 5, 6, 7, 8, 9].map(i => 'MOVER' + i + 'USDT'));
  expect(state.requestedSymbols).not.toContain('BTCUSDT');
  expect(state.requestedSymbols).not.toContain('ILLIQUIDUSDT');
  expect(state.requestedSymbols).not.toContain('UNVERIFIEDUSDT');
  expect(state.globals + state.klines).toBe(23);
  expect(state.peak).toBeLessThanOrEqual(2);
  expect(state.extras + state.chartKlines).toBe(0);
  await expect(page.locator('#heroStatusDetail')).toHaveText('Binance · 20 checked · shortlist: mixed signals');
  await expect(page.locator('#coverageNotice')).toContainText('24h VWAP');
  await expect(page.locator('#coverageNotice')).toContainText('not a measured 5m trend');
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect(state.globals + state.klines).toBe(23);
  await page.evaluate(() => { currentFilters.includeSymbols = ['MOVER9', 'ACTIVE0', 'BTC']; });
  await page.locator('#scanBtn').click();
  await expect(page.locator('#scanBtn')).toBeEnabled();
  expect((await page.locator('#resultsList .symbol').allTextContents()).sort()).toEqual(['ACTIVE0/USDT', 'MOVER9/USDT']);
  expect(state.globals + state.klines).toBe(23);
});

test('Binance: mixed mode roundtrips while old volume profiles and compact cards retain their meaning', async ({ page }) => {
  const state = await setup(page);
  await page.locator('#filtersBtn').click();
  await expect(page.locator('#marketSort')).toHaveValue('mixed');
  const result = await page.evaluate(() => {
    const legacy = { ...DEFAULT_FILTERS }; delete legacy.marketSort;
    const mixed = sanitizeFilterState(DEFAULT_FILTERS);
    const oldCard = [500000, 0, 10, 200, 10, legacy.excludeSymbols];
    const oldProfile = sanitizeCustomProfiles([{ id: 'custom-legacy', name: 'Legacy volume', filters: legacy }])[0];
    customProfiles = [oldProfile]; saveCustomProfiles();
    createCustomProfile('Mixed discovery');
    const payload = { type: 'filters', createdAt: new Date().toISOString(), filters: mixed };
    const decoded = decodeCardPayload(encodeCardPayload(payload));
    renderSocialCard(decoded.payload);
    return { mixed, decoded: decoded.payload.filters, packed: packCardFiltersV2(mixed),
      legacy: sanitizeFilterState(legacy), old: unpackCardFiltersV2(oldCard),
      oldExplicit: unpackCardFiltersV2([...oldCard, 0, []]),
      activity: unpackCardFiltersV2([...oldCard, 1, []]), unknown: unpackCardFiltersV2([...oldCard, 999, []]),
      oldProfile: oldProfile.filters, equal: filtersEqual(mixed, legacy),
      presetModes: BUILTIN_PROFILES.map(profile => profile.filters.marketSort || 'volume') };
  });
  expect(result.mixed.marketSort).toBe('mixed');
  expect(result.decoded).toEqual(result.mixed);
  expect(result.packed[6]).toBe(2);
  expect(result.old).toEqual(result.legacy);
  expect(result.oldExplicit).toEqual(result.legacy);
  expect(result.oldProfile).toEqual(result.legacy);
  expect(result.unknown).toEqual(result.legacy);
  expect(result.activity.marketSort).toBe('activity');
  expect(result.equal).toBe(false);
  expect(result.presetModes).toEqual(['mixed', 'volume', 'volume', 'activity']);
  await expect(page.locator('#socialCardRoot')).toContainText('Shortlist: mixed signals');
  await page.reload();
  await page.locator('#filtersBtn').click();
  await page.getByRole('button', { name: 'Mixed discovery', exact: false }).filter({ has: page.locator('.custom-badge') }).click();
  await expect(page.locator('#marketSort')).toHaveValue('mixed');
  await page.getByRole('button', { name: 'Legacy volume', exact: false }).filter({ has: page.locator('.custom-badge') }).click();
  await expect(page.locator('#marketSort')).toHaveValue('volume');
  await page.locator('#resetBtn').click();
  await expect(page.locator('#marketSort')).toHaveValue('mixed');
  expect(state.globals + state.klines).toBe(0);
});
