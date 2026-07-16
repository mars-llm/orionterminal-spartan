const { test, expect } = require('./coverage.fixture');

test('smoke: core UI loads and actions are visible', async ({ page }) => {
  await page.goto('./');

  await expect(page.locator('h1')).toHaveText('Spartan Orion Screener');
  await expect(page.locator('#scanBtn')).toBeVisible();
  await expect(page.locator('#themeToggleBtn')).toBeVisible();
  await expect(page.locator('#shareScanBtn')).toHaveCount(0);
  await expect(page.locator('#shareSocialCardBtn')).toBeVisible();

  const initialTheme = await page.evaluate(() => (
    document.documentElement.getAttribute('data-theme') || 'dark'
  ));
  await page.click('#themeToggleBtn');
  await expect.poll(async () => (
    page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'dark')
  )).not.toBe(initialTheme);

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

  await expect(page.locator('#shareSocialCardBtn')).toBeVisible();
  await expect(page.locator('#shareSocialCardBtn')).toContainText('Share Social Card');

  const actions = page.locator('.actions');
  await expect(actions).toBeVisible();
  const opacity = await actions.evaluate(el => getComputedStyle(el).opacity);
  expect(opacity).toBe('1');

  const actionButtons = page.locator('.actions .action-btn');
  await expect(actionButtons).toHaveCount(3);

  const visibleButtons = page.locator('.actions .action-btn:not(.mobile-chart-btn)');
  await expect(visibleButtons).toHaveCount(2);
  await expect(visibleButtons.first()).toBeVisible();
});

test('build marker: exposes deploy metadata in DOM and runtime', async ({ page }) => {
  await page.goto('./');

  await expect.poll(async () => {
    return page.evaluate(() => window.__ORION_BUILD_INFO__ && window.__ORION_BUILD_INFO__.source);
  }).toBe('build-meta.json');

  const buildInfo = await page.evaluate(async () => {
    const response = await fetch('build-meta.json', { cache: 'no-store' });
    const buildMeta = await response.json();
    return {
      runtime: window.__ORION_BUILD_INFO__,
      file: buildMeta,
    };
  });
  expect(buildInfo.runtime).toBeTruthy();
  expect(buildInfo.runtime.commit).toBe(buildInfo.file.commit);
  expect(buildInfo.runtime.date).toBe(buildInfo.file.date);
  expect(buildInfo.runtime.cardPayloadVersion).toBe(buildInfo.file.cardPayloadVersion);
  expect(buildInfo.runtime.serviceWorkerCache).toBe(buildInfo.file.serviceWorkerCache);
  expect(buildInfo.runtime.commit).toMatch(/^[0-9a-f]{7,40}$/);
  expect(buildInfo.runtime.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(buildInfo.runtime.cardPayloadVersion).toBe(2);
  expect(buildInfo.runtime.serviceWorkerCache).toMatch(/^v\d+$/);
  expect(['file', 'github-pages', 'local', 'custom']).toContain(buildInfo.runtime.runtimeChannel);

  await expect(page.locator('#appBuildMeta')).toContainText(buildInfo.runtime.commit);
  await expect(page.locator('#appBuildMeta')).toContainText('card v' + buildInfo.runtime.cardPayloadVersion);
  await expect(page.locator('html')).toHaveAttribute('data-app-build', buildInfo.runtime.commit);
  await expect(page.locator('html')).toHaveAttribute('data-build-date', buildInfo.runtime.date);
  await expect(page.locator('html')).toHaveAttribute(
    'data-card-payload-version',
    String(buildInfo.runtime.cardPayloadVersion)
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-service-worker-cache',
    buildInfo.runtime.serviceWorkerCache
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-runtime-channel',
    buildInfo.runtime.runtimeChannel
  );
  await expect(page.locator('html')).toHaveAttribute('data-build-source', 'build-meta.json');
});

test('highlights: top candidates show badges in results and chart modal', async ({ page }) => {
  await page.goto('./');

  const topSymbols = await page.evaluate(() => {
    latestBtcChange24h = 2.25;
    picks = [
      {
        symbol: 'ALPHA/USDT',
        exchange: 'binanceusdm',
        price: 10,
        priceChange1h: 1.2,
        priceChange4h: 2.4,
        priceChange24h: 4.8,
        volume24h: 150000000,
        volatility15m: 0.6,
        ticks5m: 1200,
        ticks15m: 4200,
      },
      {
        symbol: 'BRAVO/USDT',
        exchange: 'binanceusdm',
        price: 5,
        priceChange1h: -0.8,
        priceChange4h: -1.4,
        priceChange24h: -3.1,
        volume24h: 90000000,
        volatility15m: 0.55,
        ticks5m: 900,
        ticks15m: 3000,
      },
      {
        symbol: 'CHARLIE/USDT',
        exchange: 'binanceusdm',
        price: 1.2,
        priceChange1h: 2.4,
        priceChange4h: 5.2,
        priceChange24h: 9.9,
        volume24h: 250000000,
        volatility15m: 0.72,
        ticks5m: 700,
        ticks15m: 2100,
      },
      {
        symbol: 'DELTA/USDT',
        exchange: 'binanceusdm',
        price: 0.42,
        priceChange1h: 0.1,
        priceChange4h: 0.2,
        priceChange24h: 0.3,
        volume24h: 12000000,
        volatility15m: 0.2,
        ticks5m: 1800,
        ticks15m: 5000,
      },
    ];
    renderPicks();
    return candidateHighlights.topSymbols;
  });

  expect(topSymbols.length).toBe(3);
  await expect(page.locator('#resultsList .candidate-badge')).toHaveCount(3);
  await expect(page.locator('#resultsList .candidate-badge')).toContainText(['Top 1', 'Top 2', 'Top 3']);

  const firstThreeSymbols = await page.locator('#resultsList .pick-card .symbol').evaluateAll(
    (els) => els.slice(0, 3).map((el) => el.textContent)
  );
  expect(firstThreeSymbols).toEqual(topSymbols);
  await expect(page.getByLabel('Show chart for ' + topSymbols[0]).first()).toBeVisible();
  await expect(page.getByLabel('Open ' + topSymbols[0] + ' in TradingView').first()).toBeVisible();

  // No native title tooltip (we use the custom hover/tap tooltip).
  await expect(page.locator('#resultsList .candidate-badge').first()).not.toHaveAttribute('title');

  const firstWrap = page.locator('#resultsList .candidate-badge-wrap').first();
  await firstWrap.locator('.candidate-badge').hover();
  await expect(firstWrap.locator('.candidate-tooltip')).toBeVisible();
  await expect(firstWrap.locator('.candidate-tooltip-title')).toBeVisible();

  await page.evaluate((symbol) => {
    const preview = document.getElementById('chartPreview');
    preview.classList.add('visible');
    preview.classList.add('maximized');
    document.getElementById('chartPreviewSymbol').textContent = symbol;
    updateChartPreviewCandidateBadge(symbol);
  }, topSymbols[0]);

  await expect(page.locator('#chartPreviewCandidateWrap')).toBeVisible();
  await expect(page.locator('#chartPreviewCandidateBadge')).toContainText('Top');
  await expect(page.locator('#chartPreviewCandidateBadge')).not.toHaveAttribute('title');

  await page.locator('#chartPreviewCandidateBadge').hover();
  await expect(page.locator('#chartPreviewCandidateTooltip')).toBeVisible();
  await expect(page.locator('#chartPreviewCandidateTooltip .candidate-tooltip-title')).toBeVisible();
});

test('security: CSP hashes inline scripts and blocks unapproved inline code', async ({ page }) => {
  await page.goto('./');

  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("script-src 'self' https://unpkg.com");
  expect(policy).toContain("script-src-attr 'none'");
  expect(policy.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(2);

  const result = await page.evaluate(async () => {
    window.__ORION_CSP_PROBE__ = false;
    const violation = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(''), 500);
      document.addEventListener('securitypolicyviolation', (event) => {
        clearTimeout(timeout);
        resolve(event.effectiveDirective || event.violatedDirective || 'blocked');
      }, { once: true });
    });
    const script = document.createElement('script');
    script.textContent = 'window.__ORION_CSP_PROBE__ = true;';
    document.head.appendChild(script);
    const directive = await violation;
    script.remove();
    return { executed: window.__ORION_CSP_PROBE__, directive };
  });

  expect(result.executed).toBe(false);
  expect(result.directive).toContain('script-src');
});

test('accessibility: filters are labelled and dialogs contain then restore focus', async ({ page }) => {
  await page.goto('./');

  const filtersButton = page.locator('#filtersBtn');
  await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
  await filtersButton.click();
  await expect(filtersButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Min Volume (USD)')).toBeVisible();
  await expect(page.getByLabel('Max Results')).toHaveAttribute('max', '100');

  const settingsButton = page.locator('#settingsBtn');
  await settingsButton.click();
  await expect(page.locator('#settingsTabChart')).toBeFocused();
  await page.locator('#settingsModalClose').focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => (
    document.getElementById('settingsModal').contains(document.activeElement)
  ))).toBe(true);
  await page.locator('#settingsModalClose').click();
  await expect(settingsButton).toBeFocused();

  const helpButton = page.locator('#helpBtn');
  await helpButton.click();
  await expect(page.locator('#closeHelpBtn')).toBeFocused();
  await page.locator('#closeHelpBtn').click();
  await expect(helpButton).toBeFocused();
});

test('reliability UX: scan errors persist and retry clears the alert', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    fetchScreenerWithRetry = async () => {
      throw new Error('synthetic failure');
    };
  });

  await page.click('#scanBtn');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#errorText')).toContainText('Market data is unavailable right now');
  await expect(page.locator('#retryScanBtn')).toBeVisible();
  await expect(page.locator('#scanBtn')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#heroStatusTitle')).toHaveText('Scan unavailable');

  await page.evaluate(() => {
    fetchScreenerWithRetry = async () => [];
  });
  await page.click('#retryScanBtn');
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#heroStatusTitle')).toHaveText('No setups found');
});

test('responsive UX: compact workspace has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');

  const layout = await page.evaluate(() => {
    const scanRect = document.getElementById('scanBtn').getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      scanTop: scanRect.top,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.scanTop).toBeLessThan(320);
  await expect(page.locator('.hero-session')).toContainText('Ready to scan');
});

test('live deployment: scan market yields results or graceful error', async ({ page }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Live deployment gate only');

  await page.goto('./');
  await page.click('#scanBtn');

  let outcome = 'pending';
  await expect.poll(async () => {
    const cards = await page.locator('#resultsList .pick-card').count();
    if (cards > 0) {
      outcome = 'results';
      return outcome;
    }

    const scanDisabled = await page.locator('#scanBtn').isDisabled();
    const toastText = ((await page.locator('#toast').textContent()) || '').trim();
    const errorVisible = await page.locator('#error').isVisible();
    const errorText = errorVisible ? (((await page.locator('#errorText').textContent()) || '').trim()) : '';
    if (!scanDisabled && (toastText.length > 0 || errorText.length > 0)) {
      outcome = 'graceful-error';
      return outcome;
    }
    outcome = 'pending';
    return outcome;
  }, { timeout: 60000, intervals: [500, 1000, 1500] }).not.toBe('pending');

  expect(['results', 'graceful-error']).toContain(outcome);

  if (outcome === 'graceful-error') {
    const toastText = ((await page.locator('#toast').textContent()) || '').trim();
    const errorText = ((await page.locator('#errorText').textContent()) || '').trim();
    expect(toastText.length > 0 || errorText.length > 0).toBeTruthy();
  }
});
