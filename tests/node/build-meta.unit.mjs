import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuildMeta } from '../../scripts/sync-build-meta.mjs';

const input = {
  commit: 'abcdef1',
  date: '2026-10-29',
  indexSource: 'const CARD_PAYLOAD_VERSION = 2;',
  serviceWorkerSource: "const CACHE_NAME = 'spartan-orion-screener-v11';",
};

test('metadata contains only validated release fields', () => {
  assert.deepEqual(createBuildMeta(input), {
    commit: 'abcdef1', date: '2026-10-29', cardPayloadVersion: 2, serviceWorkerCache: 'v11',
  });
  const fullHash = 'abcdef0123'.repeat(4);
  assert.equal(createBuildMeta({ ...input, commit: fullHash }).commit, fullHash);
  assert.equal(createBuildMeta({ ...input, date: '2024-02-29' }).date, '2024-02-29');
});

test('arbitrary identifiers cannot be embedded as build metadata', () => {
  for (const commit of ['', 'main', '/private/example', 'person@example.test', 'abcdef1\n', 'a'.repeat(41), null]) {
    assert.throws(() => createBuildMeta({ ...input, commit }), /Build commit/);
  }
  for (const date of ['', 'today', '2026-02-29', '2026-04-31', '2026-10-29T00:00:00Z', null]) {
    assert.throws(() => createBuildMeta({ ...input, date }), /Build date/);
  }
});

test('missing or unsafe source versions stop metadata generation', () => {
  assert.throws(() => createBuildMeta({ ...input, indexSource: '' }), /card payload version/);
  assert.throws(() => createBuildMeta({ ...input, serviceWorkerSource: '' }), /cache version/);
  for (const version of ['0', '9007199254740992']) {
    assert.throws(() => createBuildMeta({ ...input, indexSource: `const CARD_PAYLOAD_VERSION = ${version};` }), /positive safe integers/);
    assert.throws(() => createBuildMeta({ ...input, serviceWorkerSource: `const CACHE_NAME = 'spartan-orion-screener-v${version}';` }), /positive safe integers/);
  }
});
