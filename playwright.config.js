const { defineConfig, devices } = require('@playwright/test');

const portValue = process.env.E2E_PORT || '43173';
const port = Number(portValue);
if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('E2E_PORT must be an integer between 1 and 65535');
}
const DEFAULT_BASE_URL = `http://127.0.0.1:${port}`;
const baseURL = process.env.E2E_BASE_URL || DEFAULT_BASE_URL;
const isLiveBaseUrl = !!process.env.E2E_BASE_URL;

const projects = isLiveBaseUrl
  ? [
      {
        name: 'chromium-desktop',
        use: {
          ...devices['Desktop Chrome'],
          browserName: 'chromium',
        },
      },
      {
        name: 'webkit-desktop',
        use: {
          ...devices['Desktop Safari'],
          browserName: 'webkit',
        },
      },
      {
        name: 'chromium-iphone',
        use: {
          ...devices['iPhone 13'],
          browserName: 'chromium',
        },
      },
    ]
  : [
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          browserName: 'chromium',
        },
      },
    ];

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects,
  webServer: isLiveBaseUrl
    ? undefined
    : {
        command: `python3 -m http.server ${port} --bind 127.0.0.1`,
        url: DEFAULT_BASE_URL,
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
