const { test, expect } = require('./coverage.fixture');

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

async function encodeCardPayloadOnPage(page, payload) {
  return page.evaluate((input) => encodeCardPayload(input), payload);
}

test('social card: creates v2 setup payload with optimized share intents', async ({ page }) => {
  await page.goto('./');

  await page.evaluate(() => {
    latestBtcChange24h = 1.25;
    currentFilters = {
      minVolume: 2000000,
      maxVolume: 8000000,
      minVolatility15m: 0.3,
      minTicks5m: 300,
      maxResults: 8,
      excludeSymbols: ['BTC'],
    };
    picks = [
      {
        symbol: 'ALPHA/USDT',
        exchange: 'binanceusdm',
        price: 2.5,
        priceChange1h: 1.1,
        priceChange4h: 2.2,
        priceChange24h: 4.5,
        volume24h: 5200000,
        volatility15m: 0.8,
        ticks5m: 980,
        ticks15m: 1300,
      },
      {
        symbol: 'BRAVO/USDT',
        exchange: 'binanceusdm',
        price: 4.2,
        priceChange1h: 0.8,
        priceChange4h: 1.5,
        priceChange24h: 2.8,
        volume24h: 4800000,
        volatility15m: 0.62,
        ticks5m: 750,
        ticks15m: 990,
      },
      {
        symbol: 'CHARLIE/USDT',
        exchange: 'binanceusdm',
        price: 1.1,
        priceChange1h: 2.1,
        priceChange4h: 3.4,
        priceChange24h: 6.4,
        volume24h: 7600000,
        volatility15m: 0.91,
        ticks5m: 680,
        ticks15m: 870,
      },
    ];
    renderPicks();
  });

  await page.click('#shareSocialCardBtn');
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#socialCardRoot .social-card-entry')).toHaveCount(3);

  const shareState = await page.evaluate(() => ({
    cardUrl: socialCardState.url,
    xHref: document.getElementById('socialCardShareXBtn')?.href || '',
    fbHref: document.getElementById('socialCardShareFacebookBtn')?.href || '',
  }));

  expect(shareState.cardUrl).toBeTruthy();
  const cardUrl = new URL(shareState.cardUrl);
  expect(cardUrl.searchParams.get('view')).toBe('social-card');
  const cardPayload = cardUrl.searchParams.get('card');
  expect(cardPayload).toBeTruthy();
  expect(cardPayload.length).toBeLessThan(450);

  const rawPayload = fromBase64UrlJson(cardPayload);
  expect(rawPayload.v).toBe(2);
  expect(rawPayload.t).toBe('s');

  const decoded = await page.evaluate((encoded) => decodeCardPayload(encoded), cardPayload);
  expect(decoded.ok).toBe(true);
  expect(decoded.payload.type).toBe('setup');
  expect(decoded.payload.setupSummary.count).toBe(3);
  expect(decoded.payload.setupSummary.top.length).toBe(3);
  expect(decoded.payload.filters).toMatchObject({
    minVolume: 2000000,
    maxVolume: 8000000,
    minVolatility15m: 0.3,
    minTicks5m: 300,
    maxResults: 8,
    excludeSymbols: ['BTC'],
  });

  const xShare = new URL(shareState.xHref);
  expect(xShare.hostname).toContain('twitter.com');
  expect(xShare.searchParams.get('url')).toBe(shareState.cardUrl);
  const xText = xShare.searchParams.get('text') || '';
  expect(xText).toContain('Futures setups heating up');
  expect(xText).not.toContain('snapshot ·');

  const facebookShare = new URL(shareState.fbHref);
  expect(facebookShare.hostname).toContain('facebook.com');
  expect(facebookShare.searchParams.get('u')).toBe(shareState.cardUrl);
  expect(facebookShare.searchParams.get('quote')).toContain('Top futures setups snapshot');
});

test('social card: no picks creates v2 filter payload', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    currentFilters = {
      minVolume: 900000,
      maxVolume: null,
      minVolatility15m: 0.15,
      minTicks5m: 240,
      maxResults: 12,
      excludeSymbols: ['ETH', 'BNB'],
    };
    picks = [];
    renderPicks();
  });

  await page.click('#shareSocialCardBtn');
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');

  const cardPayload = await page.evaluate(() => {
    const url = socialCardState.url || '';
    return url ? new URL(url).searchParams.get('card') : '';
  });
  expect(cardPayload).toBeTruthy();

  const rawPayload = fromBase64UrlJson(cardPayload);
  expect(rawPayload.v).toBe(2);
  expect(rawPayload.t).toBe('f');

  const decoded = await page.evaluate((encoded) => decodeCardPayload(encoded), cardPayload);
  expect(decoded.ok).toBe(true);
  expect(decoded.payload.type).toBe('filters');
  expect(decoded.payload.setupSummary).toBeUndefined();
  expect(decoded.payload.filters).toMatchObject({
    minVolume: 900000,
    maxVolume: null,
    minVolatility15m: 0.15,
    minTicks5m: 240,
    maxResults: 12,
    excludeSymbols: ['ETH', 'BNB'],
  });
});

test('social card: card-only view renders and sets ready marker', async ({ page }) => {
  await page.goto('./');
  const payload = await encodeCardPayloadOnPage(page, {
    type: 'setup',
    createdAt: new Date().toISOString(),
    theme: 'dark',
    filters: {
      minVolume: 1000000,
      maxVolume: null,
      minVolatility15m: 0.2,
      minTicks5m: 250,
      maxResults: 10,
      excludeSymbols: ['BTC'],
    },
    title: 'Evening setup snapshot',
    setupSummary: {
      count: 6,
      top: [
        {
          symbol: 'AAA/USDT',
          score: 79,
          volume24h: 4200000,
          ticks5m: 680,
          volatility15m: 0.74,
          btcDelta24h: 2.11,
        },
      ],
    },
  });

  await page.goto('./?view=social-card&card=' + encodeURIComponent(payload));
  await expect(page.locator('body')).toHaveClass(/social-card-only/);
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#socialCardRoot .social-card-title')).toContainText('Evening setup snapshot');

  const readyMarker = await page.evaluate(() => window.__ORION_SOCIAL_CARD_READY__);
  expect(readyMarker).toBe(true);
});

test('social card: card query without view opens modal in app shell', async ({ page }) => {
  await page.goto('./');
  const payload = await encodeCardPayloadOnPage(page, {
    type: 'filters',
    createdAt: new Date().toISOString(),
    theme: 'dark',
    filters: {
      minVolume: 1200000,
      maxVolume: null,
      minVolatility15m: 0.18,
      minTicks5m: 280,
      maxResults: 9,
      excludeSymbols: ['BTC', 'ETH'],
    },
    title: 'Shared filter set',
  });

  await page.goto('./?card=' + encodeURIComponent(payload));
  await expect(page.locator('h1')).toHaveText('Spartan Orion Screener');
  await expect(page.locator('body')).not.toHaveClass(/social-card-only/);
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');
});

test('social card: invalid payload shows friendly error state', async ({ page }) => {
  await page.goto('./?view=social-card&card=not-valid');

  await expect(page.locator('body')).toHaveClass(/social-card-only/);
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#socialCardRoot .social-card-error')).toContainText('Unable to load social card payload');
});

test('social card: oversized payload shows explicit too-large state', async ({ page }) => {
  const oversized = 'a'.repeat(9101);

  await page.goto('./?view=social-card&card=' + oversized);

  await expect(page.locator('body')).toHaveClass(/social-card-only/);
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#socialCardRoot .social-card-error')).toContainText('payload is too large');
});

test('social card: malformed v2 compact arrays fall back to filters safely', async ({ page }) => {
  const payload = toBase64UrlJson({
    v: 2,
    t: 's',
    c: Math.floor(Date.now() / 1000),
    m: 0,
    f: 'bad-filters',
    h: [3, 'bad-entry'],
  });

  await page.goto('./?view=social-card&card=' + encodeURIComponent(payload));

  await expect(page.locator('body')).toHaveClass(/social-card-only/);
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#socialCardRoot .social-card-error')).toHaveCount(0);
  await expect(page.locator('#socialCardRoot .social-card-surface')).toHaveCount(1);
  await expect(page.locator('#socialCardRoot .social-card-entry')).toHaveCount(0);
  await expect(page.locator('#socialCardRoot .social-card-footer')).toContainText('Filter-focused card');
});

test('social card: expired v2 payload shows hard-block expired state', async ({ page }) => {
  const expiredCreatedAtSeconds = Math.floor((Date.now() - (4 * 24 * 60 * 60 * 1000)) / 1000);
  const payload = toBase64UrlJson({
    v: 2,
    t: 's',
    c: expiredCreatedAtSeconds,
    m: 0,
    f: [1000000, 0, 20, 250, 10, ['BTC']],
    h: [4, ['AAA', 75, 3300000, 640, 61, -90]],
  });

  await page.goto('./?view=social-card&card=' + encodeURIComponent(payload));
  await expect(page.locator('body')).toHaveClass(/social-card-only/);
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#socialCardRoot .social-card-error')).toContainText('This card expired');
  await expect(page.locator('#socialCardRoot .social-card-surface')).toHaveCount(0);
});

test('social card: legacy v1 payload still decodes and renders', async ({ page }) => {
  const payload = toBase64UrlJson({
    v: 1,
    type: 'setup',
    createdAt: new Date().toISOString(),
    theme: 'dark',
    filters: {
      minVolume: 1000000,
      maxVolume: null,
      minVolatility15m: 0.2,
      minTicks5m: 250,
      maxResults: 10,
      excludeSymbols: ['BTC'],
    },
    setupSummary: {
      count: 4,
      top: [
        {
          symbol: 'AAA/USDT',
          score: 75,
          volume24h: 3300000,
          ticks5m: 640,
          volatility15m: 0.61,
          btcDelta24h: -0.9,
        },
      ],
    },
  });

  await page.goto('./?view=social-card&card=' + encodeURIComponent(payload));
  await expect(page.locator('body')).toHaveClass(/social-card-only/);
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#socialCardRoot .social-card-entry')).toHaveCount(1);
});

test('social card: copy link action emits success toast', async ({ page }) => {
  await page.goto('./');

  await page.evaluate(() => {
    picks = [{
      symbol: 'TEST/USDT',
      exchange: 'binanceusdm',
      price: 1.11,
      priceChange1h: 0.3,
      priceChange4h: 1.1,
      priceChange24h: 1.9,
      volume24h: 1700000,
      volatility15m: 0.5,
      ticks5m: 520,
      ticks15m: 760,
    }];
    renderPicks();
  });

  await page.click('#shareSocialCardBtn');
  await page.click('#socialCardCopyBtn');
  await expect(page.locator('#toast')).toContainText('Card link copied');
});
