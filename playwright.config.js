const { defineConfig, devices } = require('@playwright/test');

const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';
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
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects,
  webServer: isLiveBaseUrl
    ? undefined
    : {
        command: 'python3 -m http.server 4173',
        port: 4173,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
