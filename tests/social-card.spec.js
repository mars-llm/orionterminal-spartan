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

test('social card: creates setup card payload and social share intents', async ({ page }) => {
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

  const decoded = fromBase64UrlJson(cardPayload);
  expect(decoded.v).toBe(1);
  expect(decoded.type).toBe('setup');
  expect(decoded.setupSummary.count).toBe(3);
  expect(decoded.setupSummary.top.length).toBe(3);
  expect(decoded.filters).toMatchObject({
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

  const facebookShare = new URL(shareState.fbHref);
  expect(facebookShare.hostname).toContain('facebook.com');
  expect(facebookShare.searchParams.get('u')).toBe(shareState.cardUrl);
});

test('social card: no picks creates filter card payload', async ({ page }) => {
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

  const decoded = fromBase64UrlJson(cardPayload);
  expect(decoded.v).toBe(1);
  expect(decoded.type).toBe('filters');
  expect(decoded.setupSummary).toBeUndefined();
  expect(decoded.filters).toMatchObject({
    minVolume: 900000,
    maxVolume: null,
    minVolatility15m: 0.15,
    minTicks5m: 240,
    maxResults: 12,
    excludeSymbols: ['ETH', 'BNB'],
  });
});

test('social card: card-only view renders and sets ready marker', async ({ page }) => {
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
  const payload = toBase64UrlJson({
    v: 1,
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

test('social card: expired payload shows hard-block expired state', async ({ page }) => {
  const expiredCreatedAt = new Date(Date.now() - (4 * 24 * 60 * 60 * 1000)).toISOString();
  const payload = toBase64UrlJson({
    v: 1,
    type: 'setup',
    createdAt: expiredCreatedAt,
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
  await expect(page.locator('#socialCardRoot .social-card-error')).toContainText('This card expired');
  await expect(page.locator('#socialCardRoot .social-card-surface')).toHaveCount(0);
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
