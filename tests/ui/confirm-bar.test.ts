import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Audit B-01: a form that passes `confirm` to useActionForm waits for the
// "Yes, continue" bar, so the component must render {confirmBar}, or the
// action can never run.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("forms that ask for confirmation", () => {
  it("render the confirmation bar", () => {
    const root = path.resolve(__dirname, "../..");
    const missing = [...sourceFiles(path.join(root, "features")), ...sourceFiles(path.join(root, "app"))]
      .filter((file) => !file.endsWith(path.join("ui", "form.tsx"))) // the hook itself
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return /useActionForm\([^)]*confirm/.test(text) && !/\{(\w+\.)?confirmBar\}/.test(text);
      })
      .map((file) => path.relative(root, file));
    expect(missing).toEqual([]);
  });
});
