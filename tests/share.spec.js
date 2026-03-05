const { test, expect } = require('@playwright/test');

function toBase64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

test('share: setup-link sharing removed and social-card action is available', async ({ page }) => {
  await page.goto('./');

  await expect(page.locator('#shareScanBtn')).toHaveCount(0);

  const shareCardBtn = page.locator('#shareSocialCardBtn');
  await expect(shareCardBtn).toBeVisible();

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

  await expect(shareCardBtn).toContainText('Share Social Card');
});

test('share: social-card modal uses X/Facebook intents and copy toast', async ({ page }) => {
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

  await page.click('#shareSocialCardBtn');
  await expect(page.locator('#socialCardModal')).toBeVisible();
  await expect(page.locator('#socialCardRoot')).toHaveAttribute('data-ready', 'true');

  const shareState = await page.evaluate(() => ({
    cardUrl: socialCardState.url,
    xHref: document.getElementById('socialCardShareXBtn')?.href || '',
    fbHref: document.getElementById('socialCardShareFacebookBtn')?.href || '',
  }));

  expect(shareState.cardUrl).toBeTruthy();
  const cardUrl = new URL(shareState.cardUrl);
  const cardPayload = cardUrl.searchParams.get('card') || '';
  expect(cardPayload.length).toBeLessThan(450);

  const xUrl = new URL(shareState.xHref);
  expect(xUrl.hostname).toContain('twitter.com');
  expect(xUrl.searchParams.get('url')).toBe(shareState.cardUrl);
  const xText = xUrl.searchParams.get('text') || '';
  expect(xText).toContain('Futures setups heating up');
  expect(xText).not.toContain('snapshot ·');

  const facebookUrl = new URL(shareState.fbHref);
  expect(facebookUrl.hostname).toContain('facebook.com');
  expect(facebookUrl.searchParams.get('u')).toBe(shareState.cardUrl);
  expect(facebookUrl.searchParams.get('quote')).toContain('Top futures setups snapshot');

  await page.click('#socialCardCopyBtn');
  await expect(page.locator('#toast')).toContainText('Card link copied');
});

test('share: legacy ?share query is ignored safely', async ({ page }) => {
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

  await expect(page.locator('h1')).toHaveText('Spartan Orion Screener');
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#resultsContainer')).toBeHidden();
  await expect(page.locator('#minVolume')).toHaveValue('500000');
  await expect(page.locator('#maxResults')).toHaveValue('10');
});
