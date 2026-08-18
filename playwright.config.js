// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    channel: 'msedge',
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'node tests/helpers/staticServer.js',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
