const { test, expect } = require('@playwright/test');

function toBase64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64UrlJson(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
}

test('share: button hidden before scan and visible with picks', async ({ page }) => {
  await page.goto('./');

  const shareBtn = page.locator('#shareScanBtn');
  await expect(shareBtn).toBeHidden();

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

  await expect(shareBtn).toBeVisible();
});

test('share: clicking share emits metric and includes encoded payload', async ({ page }) => {
  await page.addInitScript(() => {
    window.__sharedCalls = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__sharedCalls.push(data);
      },
    });
  });

  await page.goto('./');

  await page.evaluate(() => {
    currentFilters = {
      minVolume: 1500000,
      maxVolume: 4500000,
      minVolatility15m: 0.2,
      minTicks5m: 350,
      maxResults: 7,
      excludeSymbols: ['BTC', 'ETH'],
    };
    picks = [{
      symbol: 'ALPHA/USDT',
      exchange: 'binanceusdm',
      price: 2.34,
      priceChange1h: 1.1,
      priceChange4h: 2.2,
      priceChange24h: 3.3,
      volume24h: 2200000,
      volatility15m: 0.61,
      ticks5m: 650,
      ticks15m: 1100,
    }];
    renderPicks();
  });

  await page.click('#shareScanBtn');

  const payload = await page.evaluate(() => {
    const call = window.__sharedCalls[0];
    if (!call || !call.url) return null;
    return new URL(call.url).searchParams.get('share');
  });

  expect(payload).toBeTruthy();
  const decoded = fromBase64UrlJson(payload);
  expect(decoded.v).toBe(1);
  expect(decoded.filters).toMatchObject({
    minVolume: 1500000,
    maxVolume: 4500000,
    minVolatility15m: 0.2,
    minTicks5m: 350,
    maxResults: 7,
    excludeSymbols: ['BTC', 'ETH'],
  });

  const counts = await page.evaluate(() => JSON.parse(localStorage.getItem('orion-screener-event-counts-v1') || '{}'));
  expect(counts.share_clicked).toBe(1);
});

test('share: opening shared URL applies filters and auto-scans', async ({ page }) => {
  await page.route('https://screener.orionterminal.com/api/screener', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tickers: [
          {
            symbol: 'AAAUSDT',
            baseAsset: 'AAA',
            price: 2.5,
            tf1h: { changePercent: 1.3 },
            tf4h: { changePercent: 2.7 },
            tf1d: { changePercent: 4.1, volume: 2200000 },
            tf15m: { volatility: 0.43, trades: 900 },
            tf5m: { trades: 420 },
          },
          {
            symbol: 'ETHUSDT',
            baseAsset: 'ETH',
            price: 3200,
            tf1h: { changePercent: 0.2 },
            tf4h: { changePercent: 0.6 },
            tf1d: { changePercent: 1.1, volume: 2800000 },
            tf15m: { volatility: 0.5, trades: 1000 },
            tf5m: { trades: 500 },
          },
          {
            symbol: 'BBBUSDT',
            baseAsset: 'BBB',
            price: 0.9,
            tf1h: { changePercent: 0.7 },
            tf4h: { changePercent: 1.2 },
            tf1d: { changePercent: 1.8, volume: 900000 },
            tf15m: { volatility: 0.37, trades: 830 },
            tf5m: { trades: 380 },
          },
        ],
      }),
    });
  });

  const shared = toBase64UrlJson({
    v: 1,
    filters: {
      minVolume: 1500000,
      maxVolume: 3000000,
      minVolatility15m: 0.25,
      minTicks5m: 350,
      maxResults: 5,
      excludeSymbols: ['ETH'],
    },
  });

  await page.goto('./?share=' + encodeURIComponent(shared));

  await expect(page.locator('#resultsContainer')).toBeVisible();
  await expect(page.locator('#resultsCount')).toHaveText('1 active setups');
  await expect(page.locator('#resultsList .symbol').first()).toHaveText('AAA/USDT');

  await expect(page.locator('#minVolume')).toHaveValue('1500000');
  await expect(page.locator('#maxVolume')).toHaveValue('3000000');
  await expect(page.locator('#minVolatility')).toHaveValue('0.25');
  await expect(page.locator('#minTicks')).toHaveValue('350');
  await expect(page.locator('#maxResults')).toHaveValue('5');
  await expect(page.locator('#excludeSymbols')).toHaveValue('ETH');

  const counts = await page.evaluate(() => JSON.parse(localStorage.getItem('orion-screener-event-counts-v1') || '{}'));
  expect(counts.share_opened).toBe(1);
});

test('share: invalid payload is ignored without breaking the app', async ({ page }) => {
  await page.goto('./?share=not-valid');

  await expect(page.locator('h1')).toHaveText('Spartan Orion Screener');
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#resultsContainer')).toBeHidden();

  const counts = await page.evaluate(() => JSON.parse(localStorage.getItem('orion-screener-event-counts-v1') || '{}'));
  expect(counts.share_opened || 0).toBe(0);
});
