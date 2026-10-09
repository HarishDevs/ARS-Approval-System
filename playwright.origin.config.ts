import { defineConfig } from "@playwright/test";
import { E2E_ENV } from "./playwright.config";

// Origin lock (audit P-01, D-102): the production build started WITH
// ORIGIN_SECRET, to prove the middleware reads it at run time and refuses
// requests that didn't come through Cloudflare. Run after `npm run build`:
//   npx playwright test -c playwright.origin.config.ts
const PORT = 3102;
export const ORIGIN_SECRET = "origin-secret-only-for-tests-0123456789";

export default defineConfig({
  testDir: "tests/origin",
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { ...E2E_ENV, APP_BASE_URL: `http://localhost:${PORT}`, ORIGIN_SECRET },
    // Playwright counts a 403 as "up", so the probe works with the lock on.
  },
});
