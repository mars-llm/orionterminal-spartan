const { test, expect } = require('./coverage.fixture');

test.skip(!!process.env.E2E_BASE_URL, 'Offline lifecycle verifies the local service worker');
test.use({ serviceWorkers: 'allow' });

test('PWA: image navigation preserves the offline application shell', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
  });

  const image = await page.goto('./icon-192.png');
  expect(image.headers()['content-type']).toContain('image/png');

  await context.setOffline(true);
  try {
    await page.goto('./');
    await expect(page.locator('h1')).toHaveText('Spartan Orion Screener');
    await expect(page.locator('#scanBtn')).toBeEnabled();
  } finally {
    await context.setOffline(false);
  }
});
