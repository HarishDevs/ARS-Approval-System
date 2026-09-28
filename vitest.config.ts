import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Next.js swaps "server-only" for a no-op in server bundles; outside
      // Next the real package always throws, so tests use a stub.
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["tests/helpers/setup-env.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "reference/**"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
