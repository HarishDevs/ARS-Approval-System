import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

// v1.12.5 (D-164): which build is running. Every publish makes a new build
// (and new Server Action ids); pages compare the build they were made by
// with the server's, and ask to be reloaded when it changes. Not secret:
// Next already puts it in every page.
let cached: string | null = null;

export function buildId(): string {
  if (cached === null) {
    try {
      cached = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim().slice(0, 64) || "unknown";
    } catch {
      cached = "unknown";
    }
  }
  return cached;
}
