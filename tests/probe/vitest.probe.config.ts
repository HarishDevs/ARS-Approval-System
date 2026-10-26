import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

// Local diagnosis only: the probe runs against the developer's .env.local database.
const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../.."), "server-only": path.resolve(__dirname, "../helpers/server-only-stub.ts") } },
  test: { environment: "node", include: ["tests/probe/**/*.probe.ts"], env, testTimeout: 600000, root: path.resolve(__dirname, "../..") },
});
