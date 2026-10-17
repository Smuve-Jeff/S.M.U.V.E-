import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  // Cloud verification must attach to the host-managed preview, never launch
  // an unmanaged second dev server if the preview is temporarily unavailable.
  webServer: process.env.FREEBUFF_MANAGED_PREVIEW === '1' ? undefined : {
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
  // The Studio boots a large lazy route graph on an unoptimised dev server, so
  // first paint of `.comp-shell` routinely takes 6-10s on a loaded CI host while
  // the default 5s budget expires. Every assertion here is about content, not
  // about a stopwatch — a realistic budget keeps a slow host from reading as a
  // product failure.
  expect: { timeout: 15_000 },
  // Whole-test budget. The heavy specs load a dozen Studio routes in sequence
  // and this host serves them from a cold, unoptimised dev build; the default
  // 30s expires inside `page.goto` on the later tests, which reads as a product
  // failure when it is only throughput. A genuine hang still fails.
  timeout: 60_000,
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
