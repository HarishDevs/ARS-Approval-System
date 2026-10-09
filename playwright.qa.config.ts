import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// End-to-end QA suite from the owner's master prompt (QA session 14):
// session, authorization, business rules, security, integrations, files,
// performance, accessibility and layout. Same production build and
// throw-away database as the e2e suite. Report: docs/qa/E2E-QA-REPORT.md.
// Run: npx playwright test -c playwright.qa.config.ts
export default defineConfig({
  ...base,
  testDir: "tests/qa-e2e",
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: "test-results/qa-e2e/results.json" }]],
  use: { ...base.use, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
