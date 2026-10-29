const { test, expect } = require('./coverage.fixture');

test.skip(!!process.env.E2E_BASE_URL, 'Deterministic local chart lifecycle');

async function setupChart(page) {
  const state = { intervals: [], extras: 0, delay: 0 };
  await page.route('https://fapi.binance.com/fapi/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/klines')) {
      const interval = url.searchParams.get('interval');
      state.intervals.push(interval);
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      const price = { '1m': 100, '5m': 500, '15m': 1500, '1h': 3600, '4h': 14400, '1d': 86400 }[interval];
      return route.fulfill({ json: [[1710000000000, price, price + 1, price - 1, price, 10]] });
    }
    state.extras += 1;
    return route.fulfill({ json: url.pathname.endsWith('/premiumIndex')
      ? { markPrice: '100', indexPrice: '100', lastFundingRate: '0.0001' } : { openInterest: '1000' } });
  });
  await page.goto('./');
  await page.evaluate(() => {
    ensureChartLibraryLoaded = async () => ({});
    window.__renders = [];
    window.__resizes = [];
    createChart = container => {
      container.replaceChildren();
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      chartInstance = {
        resize(width, height) {
          canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
          window.__resizes.push({ width, height });
        },
        timeScale: () => ({ fitContent() {} }),
      };
      chartCandleSeries = { setData(data) { window.__renders.push(data[0].close); },
        createPriceLine: () => ({}), removePriceLine() {} };
      return chartInstance;
    };
    picks = [{ symbol: 'ALPHA/USDT', price: 100, exchange: 'binanceusdm',
      volume24h: 2000000, ticks5m: 600, ticks15m: 1800, volatility15m: 2,
      priceChange1h: 1, priceChange4h: 2, priceChange24h: 3 }];
    renderPicks();
  });
  return state;
}

async function openExpanded(page) {
  await page.evaluate(() => showChartPreview('ALPHA/USDT', document.querySelector('.pick-card')));
  await page.locator('#chartPreviewMaximize').click();
  await expect(page.locator('#chartPreviewStats')).toContainText('Funding');
  await expect(page.locator('#chartPreviewStats')).not.toContainText('Loading');
}

test('startup: the uncached app paints and remains interactive on its first navigation', async ({ page }) => {
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('first-contentful-paint').length),
    { timeout: 2500 }).toBeGreaterThan(0);
  await page.locator('#filtersBtn').click();
  await expect(page.locator('#filtersBtn')).toHaveAttribute('aria-expanded', 'true');
});

test('startup: essential content is not gated by decorative entry animations', async ({ page }) => {
  await page.goto('./');
  expect(await page.locator('header.hero, .controls, .empty-state').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).animationName))).toEqual(['none', 'none', 'none']);
});

test('startup: a stalled optional font stylesheet cannot block the first contentful paint', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('https://fonts.googleapis.com/**', async route => {
    await held;
    await route.fulfill({ contentType: 'text/css', body: '' });
  });
  try {
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#scanBtn')).toBeVisible();
    await expect(page.locator('#appFontStylesheet')).toHaveAttribute('media', 'print');
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName('first-contentful-paint').length),
      { timeout: 2500 }).toBeGreaterThan(0);
    await expect(page.locator('#appFontStylesheet')).toHaveAttribute('media', 'print');
  } finally { release(); }
  await expect(page.locator('#appFontStylesheet')).toHaveAttribute('media', 'all');
});

test('startup: a failed optional font stays non-blocking and is requested only once', async ({ page }) => {
  let requests = 0;
  await page.route('https://fonts.googleapis.com/**', route => { requests += 1; return route.abort(); });
  await page.goto('./');
  await expect.poll(() => requests).toBe(1);
  await page.waitForTimeout(300);
  expect(requests).toBe(1);
  await expect(page.locator('#appFontStylesheet')).toHaveAttribute('media', 'print');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('first-contentful-paint').length))
    .toBeGreaterThan(0);
  await page.locator('#filtersBtn').click();
  await expect(page.locator('#filtersBtn')).toHaveAttribute('aria-expanded', 'true');
});

test('chart: rapid timeframe changes coalesce and returning to fresh data sends no request', async ({ page }) => {
  const state = await setupChart(page);
  await openExpanded(page);
  expect(state.intervals).toEqual(['1m']);
  state.delay = 400;
  await page.evaluate(async () => {
    const select = document.getElementById('chartPreviewTimeframeSelect');
    for (const timeframe of ['5m', '15m', '1m']) {
      select.value = timeframe;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  });
  await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
  await page.waitForTimeout(450);
  expect(state.intervals).toEqual(['1m']);
  expect(state.extras).toBe(2);
  expect(await page.evaluate(() => window.__renders.at(-1))).toBe(100);
  await expect(page.locator('#chartPreviewTimeframeSelect')).toHaveValue('1m');
});

test('chart: a queued timeframe change cannot reopen a closed chart', async ({ page }) => {
  const state = await setupChart(page);
  await openExpanded(page);
  // Keep a newly uncovered card from starting a separate hover interaction.
  await page.mouse.move(0, 0);
  const pending = await page.evaluate(() => {
    const select = document.getElementById('chartPreviewTimeframeSelect');
    select.value = '5m'; select.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('chartPreviewClose').click();
    return { timeframe: chartTimeframeTimeout, hover: chartPreviewTimeout };
  });
  expect(pending).toEqual({ timeframe: null, hover: null });
  await page.waitForTimeout(await page.evaluate(() => chartSettings.hoverDelay + 200));
  await expect(page.locator('#chartPreview')).not.toHaveClass(/visible/);
  expect(state.intervals).toEqual(['1m']);
});

test('chart: completed timeframe changes render matching candles and reuse each timeframe cache', async ({ page }) => {
  const state = await setupChart(page);
  await openExpanded(page);
  for (const [timeframe, close] of [['5m', 500], ['15m', 1500], ['5m', 500], ['1m', 100]]) {
    await page.locator('#chartPreviewTimeframeSelect').selectOption(timeframe);
    await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
    expect(await page.evaluate(() => window.__renders.at(-1))).toBe(close);
    await expect(page.locator('#chartPreviewTimeframeSelect')).toHaveValue(timeframe);
  }
  expect(state.intervals).toEqual(['1m', '5m', '15m']);
  expect(state.extras).toBe(2);
});

test('chart: late responses for an old timeframe cannot overwrite the current chart', async ({ page }) => {
  await setupChart(page);
  await openExpanded(page);
  await page.evaluate(() => {
    // Isolate the consumer guard, even if a data adapter ignores cancellation.
    const original = fetchChartCandles;
    window.__lateCharts = {};
    fetchChartCandles = (symbol, timeframe, limit, signal) => {
      if (timeframe === '1m') return original(symbol, timeframe, limit, signal);
      return new Promise(resolve => {
        window.__lateCharts[timeframe] = () => resolve({
          candles: [{ time: 1710000000, open: 1, high: 2000, low: 1, close: timeframe === '5m' ? 500 : 1500, volume: 10 }],
          source: CHART_SOURCES['binance-futures'], fetchedAt: Date.now(),
        });
      });
    };
  });
  await page.locator('#chartPreviewTimeframeSelect').selectOption('5m');
  await page.waitForFunction(() => window.__lateCharts['5m']);
  await page.locator('#chartPreviewTimeframeSelect').selectOption('15m');
  await page.waitForFunction(() => window.__lateCharts['15m']);
  await page.evaluate(() => window.__lateCharts['15m']());
  await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
  await page.evaluate(() => window.__lateCharts['5m']());
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__renders.at(-1))).toBe(1500);
  await expect(page.locator('#chartPreviewTimeframeSelect')).toHaveValue('15m');
});

test.describe('first PWA navigation', () => {
  test.use({ serviceWorkers: 'allow' });
  test('activation keeps the first page usable without a reload', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('startup-test-visits', String(Number(sessionStorage.getItem('startup-test-visits') || 0) + 1));
    });
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    expect(await page.evaluate(() => sessionStorage.getItem('startup-test-visits'))).toBe('1');
    await page.locator('#filtersBtn').click();
    await expect(page.locator('#filtersBtn')).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('mobile chart', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('touching the plot does not toggle details or fetch optional metrics', async ({ page }) => {
    const state = await setupChart(page);
    await page.getByRole('button', { name: 'Show chart for ALPHA/USDT' }).tap();
    await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
    await page.locator('#chartContainer canvas').tap();
    await page.waitForTimeout(100);
    await expect(page.locator('#chartPreview')).not.toHaveClass(/maximized/);
    expect(state.intervals).toEqual(['1m']);
    expect(state.extras).toBe(0);
  });

  test('horizontal scrolling or a cancelled touch cannot open a chart', async ({ page }) => {
    const state = await setupChart(page);
    await page.evaluate(() => {
      const card = document.querySelector('.pick-card');
      const touch = (type, x, y) => card.dispatchEvent(new TouchEvent(type, {
        bubbles: true, touches: [new Touch({ identifier: 1, target: card, clientX: x, clientY: y })],
      }));
      touch('touchstart', 100, 100); touch('touchmove', 140, 100); card.click();
      touch('touchstart', 100, 100); touch('touchcancel', 100, 100); card.click();
    });
    await page.waitForTimeout(200);
    await expect(page.locator('#chartPreview')).not.toHaveClass(/visible/);
    expect(state.intervals).toEqual([]);
  });

  test('rotation resizes the visible canvas without data requests and controls stay within the screen', async ({ page }) => {
    const state = await setupChart(page);
    await openExpanded(page);
    const before = { intervals: [...state.intervals], extras: state.extras };
    for (const viewport of [{ width: 812, height: 375 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => {
        const body = document.getElementById('chartPreviewBody').getBoundingClientRect();
        const last = window.__resizes.at(-1);
        return !!last && Math.abs(last.width - body.width) <= 1 && Math.abs(last.height - body.height) <= 1;
      })).toBe(true);
      expect(await page.locator('#chartPreviewClose').evaluate(button => {
        const rect = button.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      })).toBe(true);
    }
    expect({ intervals: state.intervals, extras: state.extras }).toEqual(before);
  });
});
