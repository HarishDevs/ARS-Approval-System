// Auditor probe config (audit only; not part of the app). Runs pure engine probes.
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
export default defineConfig({
  root,
  resolve: { alias: { "@": root, "server-only": path.join(root, "tests/helpers/server-only-stub.ts") } },
  test: { environment: "node", globals: true, include: ["audit/TEST_EVIDENCE/DB/probes/*.probe.test.ts"] },
});
