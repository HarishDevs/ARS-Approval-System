import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D-244 (audit SEC-02): every Admin and Super Admin page checks its own area.
// The layout's check alone isn't enough: a client-navigation request (RSC)
// renders the page without waiting for the layout, so a page that relied on
// it gave its data to anyone. This fails as soon as a page without its own
// requireArea(...) is added.
const root = path.resolve(__dirname, "../..");
function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? pages(full) : entry.name === "page.tsx" ? [full] : [];
  });
}
// A page whose only job is to send people on (it renders nothing).
const redirectOnly = (source: string) => /\bredirect\(/.test(source) && !/from "@\/lib\/db|from "@\/server\/(?!authorization)/.test(source);

describe("every admin and superadmin page checks its own area (SEC-02)", () => {
  for (const area of ["admin", "superadmin"] as const) {
    it(`/${area}`, () => {
      const files = pages(path.join(root, "app", area));
      expect(files.length).toBeGreaterThan(10);
      const unguarded = files.filter((file) => {
        const source = fs.readFileSync(file, "utf8");
        const guarded = area === "admin" ? /requireArea\("(admin|superadmin)"\)/.test(source) : /requireArea\("superadmin"\)/.test(source);
        return !guarded && !redirectOnly(source);
      });
      expect(unguarded.map((file) => path.relative(root, file))).toEqual([]);
    });
  }
});
