import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1050 } },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://localhost:5174/api/ready',
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      PORT: '5174',
      APP_ORIGIN: 'http://localhost:5174',
      RP_ID: 'localhost',
      HOST: '127.0.0.1',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://vaultline:local-development-only@127.0.0.1:54329/vaultline_test',
    },
  },
});
