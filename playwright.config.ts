import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (S5-05, P0-44): a real production build against the
// throw-away ars_approvals_test database. Run: npm run test:e2e (Docker up).
// The values below are test-only; nothing real is used.
const PORT = 3100;
export const E2E_ENV = {
  NODE_ENV: "production",
  APP_BASE_URL: `http://localhost:${PORT}`,
  DB_HOST: process.env.TEST_DB_HOST ?? "127.0.0.1",
  DB_PORT: process.env.TEST_DB_PORT ?? "3307",
  DB_NAME: "ars_approvals_test",
  DB_USER: process.env.TEST_DB_USER ?? "ars_dev",
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? "ars_dev_password",
  SESSION_SECRET: "e2e-session-secret-that-is-only-for-tests-0123456789",
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  JOB_RUNNER_SECRET: "e2e-job-runner-secret-only-for-tests",
  UPLOAD_DIR: path.join(os.tmpdir(), "ars-approvals-e2e-uploads"),
  // D-172: Pic bot talks to a local mock provider in tests (tests/e2e/mock-provider.ts).
  AI_CLAUDE_BASE_URL: "http://127.0.0.1:4011",
};

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  // D-246 (audit OPS-04): one retry on CI only. A test that passes on retry is
  // reported as "flaky" in the run (never hidden); locally a failure stays a failure.
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: E2E_ENV,
  },
});
