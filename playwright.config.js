// Playwright config for e2e tests.
//
// `webServer` boots Vite's dev server before tests, tears it down after.
// `baseURL` is consumed by tests via `page.goto('/')`.
//
// Auth-gated flows are not tested here — Cognito Hosted UI sign-in requires
// real test credentials and a stable test user. The current suite covers the
// pre-auth surface: app shell loads, redirects unauthenticated users to the
// portal, callback page handles malformed codes gracefully.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,   // fail CI if `.only` was accidentally committed
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
