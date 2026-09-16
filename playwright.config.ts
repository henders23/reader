import { defineConfig } from '@playwright/test';

// Runs the two-browser collaboration test against a freshly built server on port 8099.
// Build first: `npm run build`. Set CHROMIUM_PATH to use a system Chromium instead of
// the one Playwright downloads.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8099',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'PORT=8099 DATA_DIR=./data-e2e node --no-warnings=ExperimentalWarning server/dist/index.mjs',
    url: 'http://localhost:8099/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
