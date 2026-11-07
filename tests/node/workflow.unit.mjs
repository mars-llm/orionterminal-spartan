import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('Pages steps pin external actions to full commits and document their release tags', () => {
  const uses = workflow.match(/^\s+uses: [^\r\n]+/gm) || [];
  assert.ok(uses.length > 0);
  for (const line of uses) {
    assert.match(line.trim(), /^uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  }
});

test('Pages jobs pin the runner supported by the installed Playwright version', () => {
  assert.match(workflow, /  test:\n    runs-on: ubuntu-24\.04\n/);
  assert.match(workflow, /  deploy:\n    needs: test\n    runs-on: ubuntu-24\.04\n/);
  assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/);
});

test('Pages write and OIDC permissions are confined to the deploy job', () => {
  const [beforeDeploy, deploy] = workflow.split(/^  deploy:\n/m);
  assert.match(beforeDeploy, /^permissions:\n  contents: read\n\n/m);
  assert.doesNotMatch(beforeDeploy, /\bwrite\b/);
  assert.match(deploy, /^    permissions:\n      contents: read\n      pages: write\n      id-token: write\n/m);
});

test('Pages jobs use supported Node and do not persist checkout credentials', () => {
  const jobs = workflow.split(/^  (?:test|deploy):\n/m).slice(1);
  assert.equal(jobs.length, 2);
  for (const job of jobs) {
    assert.match(job, /uses: actions\/checkout@[^\n]+\n        with:\n          persist-credentials: false\n/);
    assert.match(job, /uses: actions\/setup-node@[^\n]+\n        with:\n          node-version: 24\n/);
  }
  assert.match(jobs[0], /^        run: npm ci --ignore-scripts$/m);
  assert.match(jobs[0], /^        run: \.\/node_modules\/\.bin\/playwright install --with-deps chromium$/m);
});
