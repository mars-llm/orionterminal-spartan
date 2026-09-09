import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');

function worker({ failure, offline = false } = {}) {
  const handlers = {};
  const deleted = [];
  const fresh = { ok: true, body: 'fresh', clone() { return this; } };
  const cached = { body: 'cached' };
  const cache = {
    async match() { if (failure === 'match') throw new Error('match failed'); return offline ? cached : undefined; },
    async put() { if (failure === 'put') throw new Error('put failed'); },
  };
  const context = vm.createContext({
    self: {
      addEventListener(name, handler) { handlers[name] = handler; },
      clients: { async claim() {} },
      location: { origin: 'https://example.test' },
    },
    caches: {
      async open() { if (failure === 'open') throw new Error('open failed'); return cache; },
      async keys() { return ['another-app-v1', 'spartan-orion-screener-v9', 'spartan-orion-screener-v10', 'spartan-orion-screener-user-data']; },
      async delete(key) { deleted.push(key); return true; },
    },
    async fetch() { if (offline) throw new Error('offline'); return fresh; },
    URL,
  });
  vm.runInContext(source, context);
  return { context, handlers, deleted, fresh, cached };
}

test('activation deletes old app caches and preserves foreign caches', async () => {
  const { handlers, deleted } = worker();
  let pending;
  handlers.activate({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['spartan-orion-screener-v9']);
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
