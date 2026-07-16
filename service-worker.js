const CACHE_NAME = 'spartan-orion-screener-v9';
const APP_SHELL_URL = './index.html';
const PRECACHE_ASSETS = [
  './',
  APP_SHELL_URL,
  './manifest.webmanifest',
  './favicon-16.png',
  './favicon-32.png',
  './icon-192.png',
  './icon-512.png',
  './social-card.png'
];

function isNavigationRequest(request) {
  if (!request) return false;
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function shouldCacheStaticAsset(request) {
  if (!request) return false;
  return ['image', 'manifest', 'style', 'script', 'font'].includes(request.destination);
}

async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(APP_SHELL_URL, response.clone());
    }
    return response;
  } catch (error) {
    const cachedShell =
      (await cache.match(APP_SHELL_URL)) ||
      (await cache.match('./')) ||
      (await caches.match(APP_SHELL_URL)) ||
      (await caches.match('./'));
    if (cachedShell) return cachedShell;
    throw error;
  }
}

async function handleStaticAssetRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isNavigationRequest(event.request)) {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  if (!shouldCacheStaticAsset(event.request)) return;

  event.respondWith(handleStaticAssetRequest(event.request));
});
