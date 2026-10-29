import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('Pages jobs pin the runner supported by the installed Playwright version', () => {
  assert.match(workflow, /  test:\n    runs-on: ubuntu-24\.04\n/);
  assert.match(workflow, /  deploy:\n    needs: test\n    runs-on: ubuntu-24\.04\n/);
  assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/);
});
