const { test, expect } = require('./coverage.fixture');

test('coverage: exercises low-touch helpers and fallback branches', async ({ page }) => {
  test.skip(process.env.COLLECT_COVERAGE !== '1', 'Coverage-only helper test');

  await page.goto('./');

  const result = await page.evaluate(async () => {
    latestBtcChange24h = 1.1;
    currentFilters = sanitizeFilterState({
      minVolume: 1200000,
      maxVolume: 9000000,
      minVolatility15m: 0.24,
      minTicks5m: 300,
      maxResults: 7,
      excludeSymbols: ['BTC', 'ETH'],
    });

    picks = [
      {
        symbol: 'ALPHA/USDT',
        exchange: 'binanceusdm',
        price: 1.7,
        priceChange1h: 1.2,
        priceChange4h: 2.4,
        priceChange24h: 5.1,
        volume24h: 6200000,
        volatility15m: 0.75,
        ticks5m: 780,
        ticks15m: 1100,
      },
      {
        symbol: 'BRAVO/USDT',
        exchange: 'binanceusdm',
        price: 4.1,
        priceChange1h: -0.2,
        priceChange4h: 1.1,
        priceChange24h: 3.4,
        volume24h: 4100000,
        volatility15m: 0.55,
        ticks5m: 620,
        ticks15m: 970,
      },
    ];
    renderPicks();

    const tooltipHost = document.createElement('div');
    populateCandidateTooltip(tooltipHost, 'ALPHA/USDT', candidateHighlights.bySymbol['ALPHA/USDT'], candidateHighlights.total);

    const setupPayload = sanitizeCardPayload({
      type: 'setup',
      createdAt: new Date().toISOString(),
      theme: 'light',
      title: 'Coverage setup card',
      note: 'Coverage note',
      filters: currentFilters,
      setupSummary: {
        count: picks.length,
        top: buildTopCardEntriesFromCurrentPicks(),
      },
    });
    const filtersPayload = sanitizeCardPayload({
      type: 'filters',
      createdAt: new Date().toISOString(),
      filters: currentFilters,
      title: '',
      note: '',
    });

    const encodedSetup = encodeCardPayload(setupPayload);
    const decodedSetup = decodeCardPayload(encodedSetup);
    const encodedFilters = encodeCardPayload(filtersPayload);
    const decodedFilters = decodeCardPayload(encodedFilters);
    const expiredMessage = formatCardErrorMessage('expired', {
      expiresAtMs: Date.now() - 1000,
    });
    const oversizedMessage = formatCardErrorMessage('too-large');
    const unsupportedMessage = formatCardErrorMessage('unsupported-version');
    const missingMessage = formatCardErrorMessage('missing');
    const invalidMessage = formatCardErrorMessage('invalid');

    renderSocialCard(setupPayload, '');
    renderSocialCard(filtersPayload, '');
    renderSocialCard(null, invalidMessage);

    const originalFetch = window.fetch;
    window.fetch = async (url) => {
      const target = String(url);
      if (target.includes('/fapi/v1/klines')) {
        return {
          ok: true,
          json: async () => ([
            [1710000000000, '1.00', '1.20', '0.90', '1.10', '1000'],
            [1710000060000, '1.10', '1.30', '1.00', '1.25', '1300'],
            [1710000120000, '1.25', '1.40', '1.10', '1.35', '1450'],
          ]),
        };
      }
      if (target.includes('/premiumIndex')) {
        return {
          ok: true,
          json: async () => ({
            markPrice: '1.25',
            indexPrice: '1.20',
            lastFundingRate: '0.0005',
            nextFundingTime: String(Date.now() + 60000),
          }),
        };
      }
      if (target.includes('/openInterest')) {
        return {
          ok: true,
          json: async () => ({
            openInterest: '120000',
          }),
        };
      }
      if (target.includes('proxy-a.example')) {
        throw new Error('HTTP 502');
      }
      return {
        ok: true,
        json: async () => ({ tickers: [{ symbol: 'BTCUSDT' }] }),
      };
    };

    let chartResult;
    let extrasResult;
    try {
      applyCorsProxies([
        { url: 'https://proxy-a.example/?url=', encode: true },
        { url: 'https://proxy-b.example/?url=', encode: true },
      ], false);
      try {
        localStorage.removeItem(PROXY_STATUS_KEY);
        sessionStorage.removeItem(PROXY_HEALTH_STORAGE_KEY);
      } catch (error) {
        // Ignore storage errors in coverage helper.
      }

      chartResult = await fetchChartCandles('ALPHA/USDT', '1m', 3);
      extrasResult = await getFuturesExtras('ALPHA/USDT');
      await fetchWithProxy(0);
      updateCorsProxyStatusFootnote();
      prefetchHoverExtras('ALPHA/USDT');
      prefetchTopCandidateExtras();
      abortExtrasPrefetch();
      abortHoverExtrasPrefetch();
    } finally {
      window.fetch = originalFetch;
    }

    chartSettings.enabled = true;
    chartSettings.timeframe = '5m';
    chartSettings.showSR15m = true;
    chartSettings.showSR1h = true;
    chartSettings.showSR4h = true;
    chartSettings.showSR1d = true;
    saveSettings();
    syncCorsProxySettingsUi();
    renderCorsProxySettingsUi();
    openSettingsModal();
    setActiveSettingsTab('network', false, false);
    closeSettingsModal();
    openAboutModal();
    closeAboutModal();
    toggleHelp();
    toggleHelp();
    toggleFilters();
    toggleFilters();

    return {
      decodedSetupOk: decodedSetup.ok,
      decodedFiltersOk: decodedFilters.ok,
      tooltipChildren: tooltipHost.childNodes.length,
      chartCandles: chartResult && chartResult.candles ? chartResult.candles.length : 0,
      extrasSource: extrasResult ? extrasResult.source : '',
      expiredMessage,
      oversizedMessage,
      unsupportedMessage,
      missingMessage,
      invalidMessage,
      buildStamp: getAppBuildStamp(window.__ORION_BUILD_INFO__),
      runtimeSource: window.__ORION_BUILD_INFO__ && window.__ORION_BUILD_INFO__.source,
    };
  });

  expect(result.decodedSetupOk).toBe(true);
  expect(result.decodedFiltersOk).toBe(true);
  expect(result.tooltipChildren).toBeGreaterThan(0);
  expect(result.chartCandles).toBe(3);
  expect(result.extrasSource).toContain('binance-futures');
  expect(result.expiredMessage).toContain('expired');
  expect(result.oversizedMessage).toContain('too large');
  expect(result.unsupportedMessage).toContain('not supported');
  expect(result.missingMessage).toContain('No social card payload');
  expect(result.invalidMessage).toContain('Unable to load social card payload');
  expect(result.buildStamp).toContain('card v2');
  expect(['build-meta.json', 'fallback']).toContain(result.runtimeSource);
});
