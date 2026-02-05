const { test, expect } = require('@playwright/test');

test('settings: chart style controls apply overrides', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');

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

test('network: users can test custom CORS proxies', async ({ page }) => {
  await page.route('https://example.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tickers: [] }),
    });
  });

  await page.goto('/');
  await page.click('#settingsBtn');
  await page.click('.settings-tab[data-tab="network"]');

  await page.click('#addCorsProxyBtn');
  const lastProxyItem = page.locator('#corsProxyList .proxy-item').last();
  await lastProxyItem.locator('input.proxy-url-input').fill('https://example.com/proxy?url=');

  await lastProxyItem.locator('button', { hasText: 'Test' }).click();
  await expect(lastProxyItem.locator('.proxy-test-status')).toContainText('OK');
});
