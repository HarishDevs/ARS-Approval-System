import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

// v1.7.0 (C01): analytics timings on a throw-away database with several
// thousand requests. Not part of CI (timing on shared runners isn't
// meaningful). Run: npx vitest run --config vitest.perf.config.ts
// Results: test-results/perf/analytics.json.
export default defineConfig({
  ...integration,
  test: {
    ...integration.test,
    include: ["tests/perf/**/*.perf.test.ts"],
    testTimeout: 600000,
    hookTimeout: 600000,
  },
});
