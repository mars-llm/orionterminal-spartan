import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');
const currentCacheName = source.match(/const CACHE_NAME = '([^']+)'/)[1];

function worker({ failure, offline = false, responseUrl = 'https://example.test/app/' } = {}) {
  const handlers = {};
  const deleted = [];
  const writes = [];
  const fresh = { ok: true, url: responseUrl, body: 'fresh', clone() { return this; } };
  const cached = { body: 'cached' };
  const cache = {
    async match() { if (failure === 'match') throw new Error('match failed'); return offline ? cached : undefined; },
    async put(request, response) {
      if (failure === 'put') throw new Error('put failed');
      writes.push({ request, response });
    },
  };
  const context = vm.createContext({
    self: {
      addEventListener(name, handler) { handlers[name] = handler; },
      clients: { async claim() {} },
      location: { origin: 'https://example.test' },
      registration: { scope: 'https://example.test/app/' },
    },
    caches: {
      async open() { if (failure === 'open') throw new Error('open failed'); return cache; },
      async keys() { return ['another-app-v1', 'spartan-orion-screener-v0', currentCacheName, 'spartan-orion-screener-user-data']; },
      async delete(key) { deleted.push(key); return true; },
    },
    async fetch() { if (offline) throw new Error('offline'); return fresh; },
    URL,
  });
  vm.runInContext(source, context);
  return { context, handlers, deleted, writes, fresh, cached };
}

test('activation deletes old app caches and preserves foreign caches', async () => {
  const { handlers, deleted } = worker();
  let pending;
  handlers.activate({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['spartan-orion-screener-v0']);
});

for (const failure of ['open', 'match', 'put']) {
  for (const handler of ['handleNavigationRequest', 'handleStaticAssetRequest']) {
    test(`${handler} returns fresh network data when cache ${failure} fails`, async () => {
      const { context, fresh } = worker({ failure });
      assert.equal(await vm.runInContext(`${handler}({})`, context), fresh);
    });
  }
}

test('offline navigation returns this app cached shell', async () => {
  const { context, cached } = worker({ offline: true });
  assert.equal(await vm.runInContext('handleNavigationRequest({})', context), cached);
});

test('offline navigation without readable storage fails with the network error', async () => {
  const { context } = worker({ offline: true, failure: 'open' });
  await assert.rejects(vm.runInContext('handleNavigationRequest({})', context), /offline/);
});

test('non-GET and cross-origin requests are not intercepted', () => {
  const { handlers } = worker();
  const respondWith = () => assert.fail('Unexpected interception');
  handlers.fetch({ request: { method: 'POST' }, respondWith });
  handlers.fetch({ request: { method: 'GET', url: 'https://other.test/image.png' }, respondWith });
});

function request(url, destination = 'document') {
  return {
    method: 'GET', url, destination,
    headers: { get() { return destination === 'document' ? 'text/html' : ''; } },
  };
}

test('unrelated same-origin pages and assets cannot enter the app cache', () => {
  const { handlers } = worker();
  const respondWith = () => assert.fail('Unexpected interception');
  for (const path of ['/other/', '/app/other.html', '/application/', '/app/icon-unrelated.png']) {
    const destination = path.endsWith('.png') ? 'image' : 'document';
    handlers.fetch({ request: request('https://example.test' + path, destination), respondWith });
  }
});

test('app entry URLs including share queries use the canonical offline shell', async () => {
  for (const path of ['/app/', '/app/index.html?card=fixture']) {
    const { handlers, writes, fresh } = worker();
    let pending;
    handlers.fetch({
      request: request('https://example.test' + path),
      respondWith(promise) { pending = promise; },
    });
    assert.ok(pending);
    assert.equal(await pending, fresh);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].request, './index.html');
  }
});

test('navigating to an image cannot replace the offline HTML shell', () => {
  const { handlers } = worker();
  handlers.fetch({
    request: request('https://example.test/app/icon-192.png'),
    respondWith() { assert.fail('Image navigation must stay outside the shell handler'); },
  });
});

test('redirects to other pages stay usable without poisoning the offline shell', async () => {
  for (const responseUrl of ['https://example.test/other/', 'https://other.test/app/']) {
    const { context, writes, fresh } = worker({ responseUrl });
    const response = await vm.runInContext('handleNavigationRequest({})', context);
    assert.equal(response, fresh);
    assert.equal(writes.length, 0);
  }
});

test('known static assets retain offline caching', async () => {
  const { handlers, writes, fresh } = worker();
  let pending;
  handlers.fetch({
    request: request('https://example.test/app/icon-192.png', 'image'),
    respondWith(promise) { pending = promise; },
  });
  assert.equal(await pending, fresh);
  assert.equal(writes.length, 1);
});
