import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    // `dev` is the only web-server script this repo defines (`dev:server` runs
    // the Express API); the previous `dev:web` reference made every e2e run fail
    // to start. Pin the port so the command cannot drift from `baseURL` when the
    // environment exports a different PORT.
    command: 'npm run dev',
    env: { PORT: '4200' },
    url: 'http://127.0.0.1:4200/hub',
    // Attach to a workspace preview that is already serving the app.
    reuseExistingServer: true,
    timeout: 180_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
