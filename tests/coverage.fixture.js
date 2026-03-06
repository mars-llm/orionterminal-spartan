const crypto = require('node:crypto');
const path = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
const { test: base, expect } = require('@playwright/test');

const coverageEnabled = process.env.COLLECT_COVERAGE === '1';
const coverageRawDir = process.env.COVERAGE_RAW_DIR || path.join(process.cwd(), 'coverage', 'raw');

function sanitizeFileName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'coverage';
}

const test = base.extend({
  page: async ({ page, browserName }, use, testInfo) => {
    const shouldCollectCoverage = coverageEnabled && browserName === 'chromium';
    if (!shouldCollectCoverage) {
      await use(page);
      return;
    }

    await page.coverage.startJSCoverage({
      resetOnNavigation: false,
      reportAnonymousScripts: true,
    });

    try {
      await use(page);
    } finally {
      let entries = [];
      try {
        entries = await page.coverage.stopJSCoverage();
      } catch (error) {
        entries = [];
      }

      const hash = crypto
        .createHash('sha1')
        .update(testInfo.titlePath.join(' > '))
        .digest('hex')
        .slice(0, 8);
      const fileName = `${sanitizeFileName(testInfo.project.name)}-${sanitizeFileName(testInfo.title)}-${hash}.json`;

      await mkdir(coverageRawDir, { recursive: true });
      await writeFile(path.join(coverageRawDir, fileName), JSON.stringify(entries, null, 2) + '\n');
    }
  },
});

module.exports = {
  test,
  expect,
};
