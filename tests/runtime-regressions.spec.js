const { test, expect } = require('./coverage.fixture');

// These tests verify the local implementation, not the separately deployed build.
test.skip(!!process.env.E2E_BASE_URL, 'Deterministic local runtime regressions');

test('runtime: invalid direct HTTP 200 falls back, valid empty payload does not', async ({ page }) => {
  const requests = [];
  let directPayload = { error: 'maintenance' };
  await page.route('https://screener.orionterminal.com/api/screener', async (route) => {
    requests.push('direct');
    await route.fulfill({ json: directPayload });
  });
  await page.route('https://proxy.example/**', async (route) => {
    requests.push('proxy');
    await route.fulfill({ json: { tickers: [] } });
  });
  await page.goto('./');
  await page.evaluate(() => {
    clearDirectApiBlocked();
    applyCorsProxies([{ url: 'https://proxy.example/?url=', encode: true }], false);
  });

  expect(await page.evaluate(() => fetchScreener())).toEqual([]);
  expect(requests).toEqual(['direct', 'proxy']);

  directPayload = { tickers: [] };
  requests.length = 0;
  await page.evaluate(() => clearDirectApiBlocked());
  expect(await page.evaluate(() => fetchScreener())).toEqual([]);
  expect(requests).toEqual(['direct']);
});

test('runtime: chart library load failure permits a fresh successful attempt', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const originalAppend = document.head.appendChild;
    const originalLibrary = window.LightweightCharts;
    const scripts = [];
    delete window.LightweightCharts;
    document.head.appendChild = function(node) {
      if (!node.matches?.('script[data-lightweight-charts="true"]')) {
        return originalAppend.call(this, node);
      }
      scripts.push(node);
      // Keep the real DOM lifecycle while preventing any CDN request or execution.
      node.type = 'application/json';
      node.removeAttribute('src');
      originalAppend.call(this, node);
      // A failed loader that leaves this node attached must not get a fresh script.
      queueMicrotask(() => {
        if (scripts.length === 1) node.dispatchEvent(new Event('error'));
        else {
          window.LightweightCharts = { testLibrary: true };
          node.dispatchEvent(new Event('load'));
        }
      });
      return node;
    };
    try {
      let firstError = '';
      try { await ensureChartLibraryLoaded(); } catch (error) { firstError = error.message; }
      const failedScriptRemoved = !scripts[0].isConnected;
      const library = await ensureChartLibraryLoaded();
      return {
        firstError,
        failedScriptRemoved,
        attempts: scripts.length,
        freshScript: scripts[0] !== scripts[1],
        successfulScriptAttached: scripts[1].isConnected,
        loaded: library.testLibrary,
      };
    } finally {
      scripts.forEach(script => script.remove());
      document.head.appendChild = originalAppend;
      window.LightweightCharts = originalLibrary;
    }
  });
  expect(result).toEqual({
    firstError: 'Chart library failed to load', failedScriptRemoved: true,
    attempts: 2, freshScript: true, successfulScriptAttached: true, loaded: true,
  });
});

test('runtime: an already aborted chart request never starts fallback fetches', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const originalFetch = window.fetch;
    let fetchCount = 0;
    window.fetch = async () => {
      fetchCount += 1;
      throw new Error('Unexpected network request');
    };
    const controller = new AbortController();
    controller.abort();
    try {
      await fetchChartCandles('ABORT/USDT', '1m', 3, controller.signal);
      return { errorName: '', fetchCount };
    } catch (error) {
      return { errorName: error.name, fetchCount };
    } finally {
      window.fetch = originalFetch;
    }
  });
  expect(result).toEqual({ errorName: 'AbortError', fetchCount: 0 });
});

test('runtime: aborting an active chart request stops the fallback chain', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const originalFetch = window.fetch;
    let fetchCount = 0;
    let notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    dataCache.clear();
    sessionStorage.removeItem(CHART_REGION_KEY);
    window.fetch = (url, options) => {
      fetchCount += 1;
      notifyStarted();
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    };
    const controller = new AbortController();
    const request = fetchChartCandles('INFLIGHTABORT/USDT', '1m', 3, controller.signal);
    await started;
    controller.abort();
    try {
      await request;
      return { errorName: '', fetchCount };
    } catch (error) {
      return { errorName: error.name, fetchCount };
    } finally {
      window.fetch = originalFetch;
    }
  });
  expect(result).toEqual({ errorName: 'AbortError', fetchCount: 1 });
});

test('runtime: failed replacement chart retries while only fresh previews are reused', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    // Isolate rendering and data transport, retaining the real preview lifecycle.
    ensureChartLibraryLoaded = async () => ({});
    updateChartPreviewStats = () => {};
    chartSettings.enabled = true;
    chartSettings.showSR15m = false;
    chartSettings.showSR1h = false;
    chartSettings.showSR4h = false;
    chartSettings.showSR1d = false;
    const calls = [];
    const renderedCloses = [];
    createChart = () => {
      chartInstance = { resize() {}, timeScale: () => ({ fitContent() {} }) };
      chartCandleSeries = { setData: candles => renderedCloses.push(candles[0].close) };
      return chartInstance;
    };
    fetchChartCandles = async (symbol) => {
      calls.push(symbol);
      if (symbol === 'B/USDT' && calls.filter(value => value === symbol).length === 1) {
        throw new Error('Synthetic chart failure');
      }
      const close = symbol === 'A/USDT' ? 1 : 2;
      return {
        candles: [{ time: 1710000000, open: close, high: close, low: close, close, volume: 1 }],
        source: { isSpot: true, label: 'Fixture spot' },
        fetchedAt: Date.now(),
      };
    };
    const card = document.getElementById('scanBtn');
    await showChartPreview('A/USDT', card);
    await showChartPreview('B/USDT', card);
    const failureVisible = !document.getElementById('chartPreviewLoading').classList.contains('hidden');
    const failedSettings = currentPreviewSettings;
    closeChartPreview();
    await showChartPreview('B/USDT', card);
    const recovered = document.getElementById('chartPreviewLoading').classList.contains('hidden');
    hideChartPreview();
    const hiddenBadge = document.getElementById('chartPreviewBadge').textContent;
    await showChartPreview('B/USDT', card);
    currentPreviewLoadedAt = Date.now() - CACHE_TTL - 1;
    await showChartPreview('B/USDT', card);
    return {
      calls, renderedCloses, failureVisible, failedSettings, recovered, hiddenBadge,
      restoredBadge: document.getElementById('chartPreviewBadge').textContent,
      sourceTitle: document.getElementById('chartPreviewBadge').title,
    };
  });
  expect(result.calls).toEqual(['A/USDT', 'B/USDT', 'B/USDT', 'B/USDT']);
  expect(result.renderedCloses).toEqual([1, 2, 2]);
  expect(result.failureVisible).toBe(true);
  expect(result.failedSettings).toBeNull();
  expect(result.recovered).toBe(true);
  expect(result.hiddenBadge).toBe('');
  expect(result.restoredBadge).toBe('Spot data');
  expect(result.sourceTitle).toContain('Fixture spot');
});

test('runtime: desktop chart visibility hides inactive controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./');
  const preview = page.locator('#chartPreview');
  await expect(preview).toHaveCSS('visibility', 'hidden');
  await page.evaluate(() => document.getElementById('chartPreview').classList.add('visible'));
  await expect(preview).toHaveCSS('visibility', 'visible');
  await page.evaluate(() => closeChartPreview());
  await expect(preview).toHaveCSS('visibility', 'hidden');
});

test('runtime: fixture scan traverses request, parser, filters, sorting and results UI', async ({ page }) => {
  const ticker = (symbol, volume, volatility, trades) => ({
    symbol, price: '1.25',
    tf1h: { changePercent: '1' },
    tf4h: { changePercent: '2' },
    tf1d: { volume: String(volume), changePercent: '3' },
    tf15m: { volatility: String(volatility), trades: String(trades * 3) },
    tf5m: { trades: String(trades) },
  });
  const tickers = [
    ticker('CHARLIEUSDT', 1000000, 0.3, 300),
    ticker('BRAVOUSDT', 2000000, 0.5, 600),
    ticker('LOWVOLUMEUSDT', 499999, 0.9, 1500),
    ticker('LOWTICKSUSDT', 3000000, 0.9, 199),
    ticker('LOWVOLATILITYUSDT', 3000000, 0.09, 1500),
    ticker('BTCUSDT', 5000000, 0.9, 1500),
    ticker('BAD&LIMIT=100USDT', 3000000, 0.9, 1500),
    ticker('ALPHAUSDT', 3000000, 0.8, 900),
  ];
  let requestCount = 0;
  await page.route('https://screener.orionterminal.com/api/screener', async (route) => {
    requestCount += 1;
    await route.fulfill({ json: { tickers } });
  });
  await page.goto('./');
  await page.evaluate(() => {
    clearDirectApiBlocked();
    // Background chart extras are independent of the screener pipeline.
    prefetchTopCandidateExtras = () => {};
  });
  await page.locator('#filtersBtn').click();
  await page.locator('#maxResults').fill('2');
  await page.locator('#maxResults').blur();
  await page.locator('#scanBtn').click();
  await expect(page.locator('#resultsList .symbol')).toHaveText(['ALPHA/USDT', 'BRAVO/USDT']);
  await expect(page.locator('#resultsCount')).toHaveText('2 active setups');
  await expect(page.locator('#heroStatusTitle')).toHaveText('2 setups found');
  await expect(page.locator('#scanBtn')).toBeEnabled();
  await expect(page.locator('#scanBtn')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#error')).toBeHidden();
  expect(requestCount).toBe(1);
});
