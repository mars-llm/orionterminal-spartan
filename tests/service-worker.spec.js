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

  const entries = await page.evaluate(async () => {
    const name = (await caches.keys()).find(key => /^spartan-orion-screener-v\d+$/.test(key));
    return (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname);
  });
  expect(entries).toContain('/index.html');
  expect(entries).not.toContain('/');
  expect(entries).not.toContain('/social-card.png');

  const image = await page.goto('./icon-192.png');
  expect(image.headers()['content-type']).toContain('image/png');

  await context.setOffline(true);
  try {
    for (const entry of ['./', './index.html']) {
      await page.goto(entry);
      await expect(page.locator('h1')).toHaveText('Spartan Orion Screener');
      await expect(page.locator('#scanBtn')).toBeEnabled();
    }
  } finally {
    await context.setOffline(false);
  }
});

test('PWA: the launcher artwork stays inside the maskable safe circle', async ({ page }) => {
  await page.goto('./');
  const metrics = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const manifest = await (await fetch(link.href)).json();
    const icon = manifest.icons.find(item => item.purpose === 'maskable');
    const image = new Image();
    image.src = new URL(icon.src, link.href).href;
    await image.decode();
    const size = 192;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let opaque = true, radius = 0, foreground = 0;
    for (let i = 0; i < data.length; i += 4) {
      opaque &&= data[i + 3] === 255;
      if (data[i] === data[0] && data[i + 1] === data[1] && data[i + 2] === data[2]) continue;
      const x = (i / 4) % size + 0.5 - size / 2;
      const y = Math.floor(i / 4 / size) + 0.5 - size / 2;
      radius = Math.max(radius, Math.hypot(x, y) / size);
      foreground++;
    }
    return { opaque, radius, foreground };
  });
  expect(metrics.opaque).toBe(true);
  expect(metrics.foreground).toBeGreaterThan(0);
  expect(metrics.radius).toBeLessThanOrEqual(0.4);
});
