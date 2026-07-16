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
    let invalidProfileCreate = null;
    let validProfileCreate = null;
    let profileCountAfterCreate = 0;
    let profileCountAfterDelete = 0;
    let proxyStatusText = '';
    let storedProxiesAfterReset = 'missing';
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
      markDirectApiBlocked();
      localStorage.setItem(CORS_PROXIES_STORAGE_KEY, JSON.stringify([
        { url: 'https://proxy-c.example/?url=', encode: true },
      ]));
      resetCorsProxiesToDefault();
      updateCorsProxyStatusFootnote();
      proxyStatusText = document.getElementById('corsProxyStatus')?.textContent || '';
      storedProxiesAfterReset = localStorage.getItem(CORS_PROXIES_STORAGE_KEY);
      clearDirectApiBlocked();
      invalidProfileCreate = createCustomProfile('   ');
      validProfileCreate = createCustomProfile('Coverage custom preset');
      profileCountAfterCreate = getAllProfiles().length;
      deleteCustomProfile(activeProfileId);
      profileCountAfterDelete = getAllProfiles().length;
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

    const sanitizedCandles = sanitizeCandles([
      { time: 3, open: 3, high: 4, low: 2, close: 3.5, volume: 10 },
      { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 8 },
      { time: 2, open: 2, high: 1, low: 0.5, close: 1.5, volume: 4 },
      { time: 4, open: 4, high: 5, low: 3, close: 4.5, volume: -1 },
    ]);
    const boundedFilters = sanitizeFilterState({
      minVolume: -10,
      minVolatility15m: 99999,
      minTicks5m: 9999999999,
      maxResults: 9999,
      excludeSymbols: ['BTC', 'bad symbol', 'BTC'],
    });
    const proxyPolicy = {
      secure: inspectCorsProxyUrl('https://proxy.example/?url=').valid,
      loopback: inspectCorsProxyUrl('http://localhost:8787/?url=').valid,
      ipv6Loopback: inspectCorsProxyUrl('http://[::1]:8787/?url=').valid,
      remoteHttp: inspectCorsProxyUrl('http://proxy.example/?url=').valid,
      credentials: inspectCorsProxyUrl('https://user:pass@proxy.example/?url=').valid,
    };
    const parsedScreenerPicks = parseScreenerData({
      tickers: [
        {
          symbol: 'SAFEUSDT',
          price: '1.25',
          tf1d: { volume: '1250000', changePercent: '4.5' },
          tf15m: { volatility: '0.8', trades: '450' },
          tf5m: { trades: '300' },
        },
        {
          symbol: 'BAD&LIMIT=100USDT',
          price: '2',
          tf1d: { volume: '5000' },
        },
        {
          symbol: 'INFINITEUSDT',
          price: '1e999',
          tf1d: { volume: '5000' },
        },
      ],
    });

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
      invalidProfileCreate,
      validProfileCreate,
      profileCountAfterCreate,
      profileCountAfterDelete,
      proxyStatusText,
      storedProxiesAfterReset,
      buildStamp: getAppBuildStamp(window.__ORION_BUILD_INFO__),
      runtimeSource: window.__ORION_BUILD_INFO__ && window.__ORION_BUILD_INFO__.source,
      candleTimes: sanitizedCandles.map((candle) => candle.time),
      boundedFilters,
      proxyPolicy,
      parsedScreenerSymbols: parsedScreenerPicks.map((pick) => pick.symbol),
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
  expect(result.invalidProfileCreate).toBe(false);
  expect(result.validProfileCreate).toBe(true);
  expect(result.profileCountAfterCreate).toBe(5);
  expect(result.profileCountAfterDelete).toBe(4);
  expect(result.proxyStatusText).toContain('Direct Orion API access is blocked here');
  expect(result.proxyStatusText).toContain('Active list: default');
  expect(result.storedProxiesAfterReset).toBe(null);
  expect(result.buildStamp).toContain('card v2');
  expect(['build-meta.json', 'fallback']).toContain(result.runtimeSource);
  expect(result.candleTimes).toEqual([1, 3]);
  expect(result.boundedFilters).toMatchObject({
    minVolume: 0,
    minVolatility15m: 10000,
    minTicks5m: 1000000000,
    maxResults: 100,
    excludeSymbols: ['BTC'],
  });
  expect(result.proxyPolicy).toEqual({
    secure: true,
    loopback: true,
    ipv6Loopback: false,
    remoteHttp: false,
    credentials: false,
  });
  expect(result.parsedScreenerSymbols).toEqual(['SAFE/USDT']);
});
