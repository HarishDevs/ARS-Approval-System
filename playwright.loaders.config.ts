import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Loader and loading-state QA audit (QA session 13). Not part of CI: these
// tests assert the *target* behaviour (e.g. a request that never answers
// must not spin forever), so they fail where the app has a defect, and the
// report (docs/qa/LOADER-QA-REPORT.md) records each result.
// Run: npx playwright test -c playwright.loaders.config.ts
export default defineConfig({
  ...base,
  testDir: "tests/qa-loaders",
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: "test-results/loader-audit/results.json" }]],
  use: { ...base.use, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
