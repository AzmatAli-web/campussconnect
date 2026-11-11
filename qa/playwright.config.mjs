import { defineConfig } from '@playwright/test';

// Tests only the public landing/login screen; privileged dashboards require separate staged accounts.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.QA_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  projects: [
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'tablet-chromium', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } } }
  ]
});
