import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessRule } from "@/server/authorization/pages";

// V181-A7 (AUD-14, REC-06): page access fails closed, for a restricted
// person, on an address that is no configured page; the security page and
// the other listed open addresses stay usable; shared actions name their page.
const state = vi.hoisted(() => ({ path: "/users" as string | null, rules: [] as AccessRule[] }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.path ? { "x-ars-path": state.path, "x-ars-path-sig": "sig" } : {}),
}));
vi.mock("@/lib/security/path-signature", () => ({
  PATH_HEADER: "x-ars-path",
  PATH_SIGNATURE_HEADER: "x-ars-path-sig",
  verifyPath: async (value: string | null) => Boolean(value),
}));
vi.mock("@/lib/db/repositories/page-access.repository", () => ({
  departmentOf: async () => null,
  rulesForPerson: async () => state.rules,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: () => undefined }));

const { checkPageAccess, checkPageKey } = await import("@/server/authorization/page-access");
const { isOpenAddress, OPEN_PATHS, pageForPath, PAGES } = await import("@/server/authorization/pages");

const ALL = ["APPROVAL", "TASK", "INFORMATION", "AI"] as const;
const admin = { id: 9, roles: ["USER", "IT_ADMIN"], modules: [...ALL] };
const hide = (pageKey: string, level: AccessRule["level"] = "HIDDEN"): AccessRule => ({ pageKey, scope: "USER", scopeId: 9, level });

beforeEach(() => {
  state.path = "/users";
  state.rules = [];
});

describe("isOpenAddress (V181-A7)", () => {
  it("open: the security page, the listed hubs, and API routes; closed: unknown and Super Admin addresses", () => {
    expect(isOpenAddress("/users/security")).toBe(true);
    expect(isOpenAddress("/users/security?x=1")).toBe(true);
    expect(isOpenAddress("/users/approvals")).toBe(true);
    expect(isOpenAddress("/users/people/12")).toBe(true);
    expect(isOpenAddress("/api/me/sign-out-everywhere")).toBe(true);
    expect(isOpenAddress("/users/not-a-page")).toBe(false);
    expect(isOpenAddress("/admin/not-a-page")).toBe(false);
    expect(isOpenAddress("/superadmin/import")).toBe(false);
    expect(isOpenAddress("/")).toBe(false);
  });

  it("no open address is also a configured page (a page rule would be silently skipped)", () => {
    for (const sample of ["/users/security", "/users/approvals", "/users/more", "/users/people/1", "/admin/notifications"]) {
      expect(pageForPath(sample), sample).toBeNull();
      expect(OPEN_PATHS.some((pattern) => pattern.test(sample)), sample).toBe(true);
    }
  });

  it("every page under /users and /admin is a configured page or a listed open address (else restricted people get a 404)", () => {
    const root = path.resolve(__dirname, "../..");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name === "page.tsx" ? [dir] : []));
    const addresses = ["users", "admin"].flatMap((area) =>
      walk(path.join(root, "app", area)).map((dir) =>
        `/${path.relative(path.join(root, "app"), dir).split(path.sep).filter((part) => !/^\(.*\)$/.test(part)).map((part) => (/^\[.*\]$/.test(part) ? "1" : part)).join("/")}`,
      ),
    );
    expect(addresses.length).toBeGreaterThan(50);
    expect(addresses.filter((address) => !pageForPath(address) && !isOpenAddress(address))).toEqual([]);
  });

  it("SEC-17: the security page can't be restricted (not on the page list)", () => {
    expect(PAGES.some((page) => page.key === "users.security")).toBe(false);
  });
});

describe("checkPageAccess on an address that is no configured page (V181-A7)", () => {
  it("no restrictions: allowed exactly as before", async () => {
    state.path = "/users/not-a-page";
    expect(await checkPageAccess(admin, true)).toEqual({ ok: true, level: null });
  });

  it("any restriction: refused (fail closed), for views and changes", async () => {
    state.rules = [hide("users.calendar", "VIEW")];
    state.path = "/users/not-a-page";
    expect(await checkPageAccess(admin, true)).toMatchObject({ ok: false, reason: "UNKNOWN_PAGE" });
    expect(await checkPageAccess(admin, false)).toMatchObject({ ok: false, reason: "UNKNOWN_PAGE" });
  });

  it("a missing module counts as a restriction", async () => {
    state.path = "/admin/not-a-page";
    expect(await checkPageAccess({ ...admin, modules: ["APPROVAL"] }, true)).toMatchObject({ ok: false, reason: "UNKNOWN_PAGE" });
  });

  it("restricted, but the security page and API routes still work", async () => {
    state.rules = [hide("admin.import")];
    state.path = "/users/security";
    expect(await checkPageAccess(admin, true)).toEqual({ ok: true, level: null });
    state.path = "/api/me/sign-out-everywhere";
    expect(await checkPageAccess(admin, true)).toEqual({ ok: true, level: null });
  });

  it("Super Admin addresses refuse everyone else, restricted or not (G-3)", async () => {
    state.path = "/superadmin/import";
    expect(await checkPageAccess(admin, true)).toMatchObject({ ok: false, reason: "UNKNOWN_PAGE" });
  });

  it("the Super Admin is never restricted", async () => {
    state.rules = [hide("admin.import")];
    state.path = "/users/not-a-page";
    expect(await checkPageAccess({ ...admin, roles: ["SUPER_ADMIN"] }, true)).toEqual({ ok: true, level: null });
  });

  it("a configured page keeps its own rule", async () => {
    state.rules = [hide("users.calendar", "VIEW")];
    state.path = "/users/calendar";
    expect(await checkPageAccess(admin, false)).toEqual({ ok: true, level: "VIEW" });
    expect(await checkPageAccess(admin, true)).toMatchObject({ ok: false, reason: "VIEW_ONLY", pageKey: "users.calendar" });
  });
});

describe("an action that names its page (G-3 / V181-A7)", () => {
  it("admin.import Hidden: the import action's own key is refused wherever it is posted", async () => {
    state.rules = [hide("admin.import")];
    expect(await checkPageKey(admin, "admin.import", true)).toMatchObject({ ok: false, reason: "HIDDEN", pageKey: "admin.import" });
  });

  it("admin.users View-only: setting out-of-office for someone else (admin.users) is refused", async () => {
    state.rules = [hide("admin.users", "VIEW")];
    expect(await checkPageKey(admin, "admin.users", true)).toMatchObject({ ok: false, reason: "VIEW_ONLY" });
    expect(await checkPageKey(admin, "admin.users", false)).toEqual({ ok: true, level: "VIEW" });
  });
});
