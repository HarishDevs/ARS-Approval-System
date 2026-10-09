import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/http/safe-next";

describe("after sign-in, only go to a page in this app (audit S-02)", () => {
  it("keeps normal paths with their query", () => {
    expect(safeNextPath("/users/requests/12")).toBe("/users/requests/12");
    expect(safeNextPath("/admin/users?q=ravi")).toBe("/admin/users?q=ravi");
    expect(safeNextPath(["/admin", "/x"])).toBe("/admin");
  });

  it("refuses anything that a browser would send to another site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "evil.com", "javascript:alert(1)", "", undefined, null]) {
      expect(safeNextPath(bad)).toBe("/users");
    }
  });
});
