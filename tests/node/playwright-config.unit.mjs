import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function config(overrides = {}) {
  const env = { ...process.env, E2E_BASE_URL: '', E2E_PORT: '', ...overrides };
  return JSON.parse(execFileSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require("./playwright.config.js")))'], { env, encoding: 'utf8' }));
}

test('local browser tests use a dedicated loopback server without reuse', () => {
  const result = config();
  assert.equal(result.workers, 2);
  assert.equal(result.use.baseURL, 'http://127.0.0.1:43173');
  assert.equal(result.webServer.reuseExistingServer, false);
  assert.match(result.webServer.command, /--bind 127\.0\.0\.1$/);
});

test('port override updates browser URL and server together', () => {
  const result = config({ E2E_PORT: '43210' });
  assert.equal(result.use.baseURL, 'http://127.0.0.1:43210');
  assert.equal(result.webServer.url, result.use.baseURL);
  assert.match(result.webServer.command, /http\.server 43210 /);
});

test('live URL does not start a local server', () => {
  assert.equal(config({ E2E_BASE_URL: 'https://example.test/' }).webServer, undefined);
});
