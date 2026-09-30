import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests against a real MySQL (S2-06b). A throw-away database
// `ars_approvals_test` is recreated, migrated and seeded before the run
// (tests/integration/global-setup.ts). Run with `npm run test:integration`
// after `npm run db:up`; CI runs it against a MySQL service container.
const DB = {
  DB_HOST: process.env.TEST_DB_HOST ?? "127.0.0.1",
  DB_PORT: process.env.TEST_DB_PORT ?? "3307",
  DB_NAME: "ars_approvals_test",
  DB_USER: process.env.TEST_DB_USER ?? "ars_dev",
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? "ars_dev_password",
};

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.int.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/helpers/setup-env.ts"],
    env: DB,
    // One database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
