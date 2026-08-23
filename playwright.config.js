const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // Screenshots are always produced in the Linux Playwright container (see
  // tests/run-in-docker.sh), so baselines need no platform suffix.
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixels: 100 }
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 420, height: 900 } }
    }
  ],
  webServer: {
    command: `node tests/server.js`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI
  }
});
