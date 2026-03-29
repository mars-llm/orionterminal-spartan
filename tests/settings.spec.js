const { test, expect } = require('./coverage.fixture');
const isLiveBase = !!process.env.E2E_BASE_URL;

async function openSettingsTab(page, tab) {
  await page.goto('./');
  await page.click('#settingsBtn');
  await page.click(`.settings-tab[data-tab="${tab}"]`);
  await expect(page.locator(`#settingsPanel${tab[0].toUpperCase()}${tab.slice(1)}`)).toBeVisible();
}

async function clearProxyRows(page) {
  const rows = page.locator('#corsProxyList .proxy-item');
  while ((await rows.count()) > 0) {
    await rows.first().getByRole('button', { name: 'Remove' }).click();
  }
}

async function addProxyRow(page, url, encodeUrl) {
  await page.click('#addCorsProxyBtn');
  const row = page.locator('#corsProxyList .proxy-item').last();
  const input = row.locator('input.proxy-url-input');
  await input.fill(url);

  if (typeof encodeUrl === 'boolean') {
    const checkbox = row.locator('input[type="checkbox"]');
    if ((await checkbox.isChecked()) !== encodeUrl) {
      await checkbox.click();
    }
  }

  return row;
}

test('settings: chart style controls apply overrides', async ({ page }) => {
  await page.goto('./');
  await page.click('#settingsBtn');
  await page.click('.settings-tab[data-tab="style"]');

  await expect(page.locator('#settingCandleUp')).toBeVisible();
  await expect(page.locator('#settingVolUsdBars')).toBeVisible();

  await page.evaluate(() => {
    const input = document.getElementById('settingVolUsdBars');
    input.value = '#000000';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const barUp = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--volusd-bar-up').trim()
  );
  const barDown = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--volusd-bar-down').trim()
  );
  expect(barUp).toBe('#000000');
  expect(barDown).toBe('#000000');

  await page.click('#resetChartStyleBtn');
  const barUpAfter = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--volusd-bar-up').trim()
  );
  expect(barUpAfter).toBe('');
});

test('maximized preview shows external link icons', async ({ page }) => {
  await page.goto('./');

  await page.evaluate(() => {
    const preview = document.getElementById('chartPreview');
    preview.classList.add('maximized');
    preview.classList.add('visible');
  });

  await expect(page.locator('#chartPreviewLinks')).toBeVisible();
  await expect(page.locator('#chartPreviewTvLink .chart-preview-link-icon')).toBeVisible();
  await expect(page.locator('#chartPreviewBinanceLink .chart-preview-link-icon')).toBeVisible();
  await expect(page.locator('#chartPreviewBitunixLink .chart-preview-link-icon')).toBeVisible();
});

test('settings: tabs support click + keyboard navigation', async ({ page }) => {
  await page.goto('./');
  await page.click('#settingsBtn');

  const chartTab = page.locator('#settingsTabChart');
  const styleTab = page.locator('#settingsTabStyle');
  const displayTab = page.locator('#settingsTabDisplay');
  const networkTab = page.locator('#settingsTabNetwork');

  await expect(chartTab).toHaveAttribute('aria-selected', 'true');

  await styleTab.click();
  await expect(styleTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#settingsPanelStyle')).toBeVisible();

  await styleTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(displayTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#settingsPanelDisplay')).toBeVisible();

  await page.keyboard.press('End');
  await expect(networkTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#settingsPanelNetwork')).toBeVisible();

  await page.keyboard.press('Home');
  await expect(chartTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#settingsPanelChart')).toBeVisible();
});

test('theme toggle does not reopen a hidden preview or trigger chart fetches', async ({ page }) => {
  await page.goto('./');

  await page.evaluate(() => {
    const preview = document.getElementById('chartPreview');
    preview.classList.remove('visible');
    currentPreviewSymbol = 'ALPHA/USDT';
    currentPreviewCard = document.createElement('div');
    window.__themeToggleFetchCount = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = function(...args) {
      window.__themeToggleFetchCount += 1;
      return originalFetch(...args);
    };
  });

  await page.click('#themeToggleBtn');

  const result = await page.evaluate(() => ({
    visible: document.getElementById('chartPreview').classList.contains('visible'),
    fetchCount: window.__themeToggleFetchCount,
  }));

  expect(result.visible).toBe(false);
  expect(result.fetchCount).toBe(0);
});

test('network: progressive guidance and advanced details render', async ({ page }) => {
  await openSettingsTab(page, 'network');

  await expect(page.locator('#settingsPanelNetwork .settings-quick-guide')).toContainText('Use proxy fallback only when direct Orion API access is blocked.');
  const checklist = page.locator('#settingsPanelNetwork .settings-checklist');
  await expect(checklist).toContainText('Step 1: Add URL');
  await expect(checklist).toContainText('Step 2: Test (or Test All)');
  await expect(checklist).toContainText('Step 3: Save');

  const details = page.locator('#networkAdvancedDetails');
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  await expect(details).toContainText('Public proxies may log requested URLs and may be unreliable.');
});

test('network: invalid URL shows inline validation and blocks save', async ({ page }) => {
  await openSettingsTab(page, 'network');
  await clearProxyRows(page);

  const row = await addProxyRow(page, 'example.com/proxy?url=');
  const input = row.locator('input.proxy-url-input');
  await input.blur();

  await expect(row.locator('.proxy-validation')).toContainText('Proxy URL must start with http:// or https://');
  await expect(page.locator('#saveCorsProxyBtn')).toBeDisabled();
  await expect(page.locator('#corsProxyStatus')).toContainText('Resolve highlighted URL errors before saving.');
});

test('network: per-row test updates status from idle to passed', async ({ page }) => {
  await page.route('https://example.com/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tickers: [] }),
    });
  });

  await openSettingsTab(page, 'network');
  await clearProxyRows(page);
  const row = await addProxyRow(page, 'https://example.com/proxy?url=', true);

  const status = row.locator('.proxy-test-status');
  await expect(status).toContainText('Not tested');

  await row.getByRole('button', { name: 'Test' }).click();
  await expect(status).toContainText('Testing...');
  await expect(status).toContainText(/Passed ·|Failed ·/);
  if (!isLiveBase) {
    await expect(status).toContainText('Passed · 0 tickers ·');
  }
  await expect(page.locator('#saveCorsProxyBtn')).toBeEnabled();
});

test('network: test all runs sequentially and reports aggregate result', async ({ page }) => {
  await page.route('https://example.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tickers: [{ symbol: 'BTCUSDT' }] }),
    });
  });

  await page.route('https://bad.example/**', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'bad gateway' }),
    });
  });

  await openSettingsTab(page, 'network');
  await clearProxyRows(page);
  await addProxyRow(page, 'https://example.com/proxy?url=', true);
  await addProxyRow(page, 'https://bad.example/proxy?url=', true);
  const goodRow = page.locator('#corsProxyList .proxy-item').nth(0);
  const badRow = page.locator('#corsProxyList .proxy-item').nth(1);
  await expect(page.locator('#corsProxyList .proxy-item')).toHaveCount(2);

  if (isLiveBase) {
    await page.evaluate(async () => {
      if (typeof testAllCorsProxies === 'function') {
        await testAllCorsProxies();
      }
    });
    await expect.poll(async () => {
      const statuses = await page.locator('#corsProxyList .proxy-test-status').allTextContents();
      return statuses.some((text) => /Passed ·|Failed ·/i.test(text));
    }).toBeTruthy();
    return;
  }

  await page.click('#testAllCorsProxyBtn');
  await expect(page.locator('#toast')).toContainText(/\/2 proxies passed/);
  await expect(goodRow.locator('.proxy-test-status')).toContainText('Passed · 1 tickers ·');
  await expect(badRow.locator('.proxy-test-status')).toContainText('Failed · HTTP 502');
  await expect(page.locator('#toast')).toContainText('1/2 proxies passed');
});

test('network: runtime proxy health demotes recent failures during the same session', async ({ page }) => {
  await page.goto('./');

  const result = await page.evaluate(async () => {
    applyCorsProxies([
      { url: 'https://proxy-a.example/?url=', encode: true },
      { url: 'https://proxy-b.example/?url=', encode: true },
      { url: 'https://proxy-c.example/?url=', encode: true },
    ], false);

    try {
      localStorage.removeItem(PROXY_STATUS_KEY);
      sessionStorage.removeItem(PROXY_HEALTH_STORAGE_KEY);
    } catch (e) {
      // Ignore storage errors in test setup.
    }

    const originalFetch = window.fetch;
    const sequences = [];
    let currentSequence = [];

    window.fetch = async (url) => {
      const target = String(url);
      currentSequence.push(target);
      if (target.includes('proxy-a.example')) {
        throw new Error('HTTP 502');
      }
      return {
        ok: true,
        json: async () => ({ tickers: [] }),
      };
    };

    try {
      await fetchWithProxy(0);
      sequences.push(currentSequence.slice());
      currentSequence = [];

      await fetchWithProxy(0);
      sequences.push(currentSequence.slice());

      return {
        sequences,
        preferred: getPreferredProxyIndex(),
        healthA: getProxyHealth(0),
        healthB: getProxyHealth(1),
      };
    } finally {
      window.fetch = originalFetch;
      try {
        sessionStorage.removeItem(PROXY_HEALTH_STORAGE_KEY);
        localStorage.removeItem(PROXY_STATUS_KEY);
      } catch (e) {
        // Ignore storage cleanup errors.
      }
    }
  });

  expect(result.sequences).toHaveLength(2);
  expect(result.sequences[0][0]).toContain('proxy-a.example');
  expect(result.sequences[0][1]).toContain('proxy-b.example');
  expect(result.sequences[1][0]).toContain('proxy-b.example');
  expect(result.preferred).toBe(1);
  expect(result.healthA.failureStreak).toBeGreaterThan(0);
  expect(result.healthB.failureStreak).toBe(0);
  expect(result.healthB.lastSuccessAt).toBeGreaterThan(0);
});

test('network: save and reopen preserves proxy draft + preferred proxy', async ({ page }) => {
  await openSettingsTab(page, 'network');
  await clearProxyRows(page);

  await addProxyRow(page, 'https://example.com/proxy?url=', true);
  await addProxyRow(page, 'https://second.example/proxy?url=', false);

  await page.selectOption('#settingPreferredProxy', '1');
  await page.click('#saveCorsProxyBtn');
  await expect(page.locator('#toast')).toContainText('Network settings saved');

  await page.click('#settingsModalClose');
  await page.click('#settingsBtn');
  await page.click('.settings-tab[data-tab="network"]');

  const rows = page.locator('#corsProxyList .proxy-item');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('input.proxy-url-input')).toHaveValue('https://example.com/proxy?url=');
  await expect(rows.nth(1).locator('input.proxy-url-input')).toHaveValue('https://second.example/proxy?url=');
  await expect(rows.nth(0).locator('input[type="checkbox"]')).toBeChecked();
  await expect(rows.nth(1).locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(page.locator('#settingPreferredProxy')).toHaveValue('1');
});
