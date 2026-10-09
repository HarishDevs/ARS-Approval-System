import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Load test (GL-03, D-105): the production build under concurrent use, on
// the throw-away database. Run: npx playwright test -c playwright.perf.config.ts
// Results: test-results/perf/load.json. Not part of CI (timing on shared
// runners isn't meaningful); run before go-live and after big changes.
export default defineConfig({
  ...base,
  testDir: "tests/perf",
  timeout: 600_000,
  reporter: "list",
});
