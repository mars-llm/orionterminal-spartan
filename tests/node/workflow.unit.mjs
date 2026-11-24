import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');

function job(name) {
  const body = workflow.split(`\n  ${name}:\n`)[1];
  assert.ok(body, `Missing Pages job: ${name}`);
  return body.split(/^  \S/m)[0];
}

test('Pages steps pin external actions to full commits and document their release tags', () => {
  const uses = workflow.match(/^\s+uses: [^\r\n]+/gm) || [];
  assert.ok(uses.length > 0);
  for (const line of uses) {
    assert.match(line.trim(), /^uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  }
});

test('Pages jobs pin the runner supported by the installed Playwright version', () => {
  for (const name of ['test', 'package', 'deploy']) {
    assert.match(job(name), /^    runs-on: ubuntu-24\.04$/m);
  }
  assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/);
});

test('retrying a Pages deployment only consumes the artifact from the successful package job', () => {
  const pack = job('package');
  const publish = job('deploy');
  assert.match(job('test'), /^        run: npm test$/m);
  assert.match(pack, /^    needs: test$/m);
  assert.match(publish, /^    needs: package$/m);
  assert.equal((workflow.match(/uses: actions\/upload-pages-artifact@/g) || []).length, 1);
  assert.match(pack, /id: stage\n[\s\S]*artifact_name=github-pages-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}" >> "\$GITHUB_OUTPUT"/);
  assert.match(pack, /upload-pages-artifact@[^\n]+\n        with:\n          name: \$\{\{ steps\.stage\.outputs\.artifact_name \}\}/);
  assert.match(pack, /outputs:\n      artifact_name: \$\{\{ steps\.stage\.outputs\.artifact_name \}\}/);
  assert.match(publish, /deploy-pages@[^\n]+\n        with:\n          artifact_name: \$\{\{ needs\.package\.outputs\.artifact_name \}\}/);
  assert.doesNotMatch(publish, /upload-pages-artifact@|checkout@|setup-node@|^\s+run:/m);
});

test('Pages write and OIDC permissions are confined to the deploy job', () => {
  const [beforeDeploy, deploy] = workflow.split(/^  deploy:\n/m);
  assert.match(beforeDeploy, /^permissions:\n  contents: read\n\n/m);
  assert.doesNotMatch(beforeDeploy, /\bwrite\b/);
  assert.match(deploy, /^    permissions:\n      contents: read\n      pages: write\n      id-token: write\n/m);
});

test('test and package use supported Node and do not persist checkout credentials', () => {
  for (const name of ['test', 'package']) {
    assert.match(job(name), /uses: actions\/checkout@[^\n]+\n        with:\n          persist-credentials: false\n/);
    assert.match(job(name), /uses: actions\/setup-node@[^\n]+\n        with:\n          node-version: 24\n/);
  }
  assert.match(job('test'), /^        run: npm ci --ignore-scripts$/m);
  assert.match(job('test'), /^        run: \.\/node_modules\/\.bin\/playwright install --with-deps chromium$/m);
});
