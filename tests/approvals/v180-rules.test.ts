import { describe, expect, it } from "vitest";
import { effectiveLevel, pageForPath, PAGES } from "@/server/authorization/pages";
import { signPath, verifyPath } from "@/lib/security/path-signature";
import { applyStepPolicy, DEFAULT_STEP_POLICY, parseStepPolicy, stepDefaults } from "@/server/workflows/step-policy";
import { listFilterSql, listQuery, parseListFilters, tabsFor } from "@/server/requests/list-filters";
import { checkCustomConfig, DEFAULT_CUSTOM_FORM } from "@/server/approvals/custom-config";
import type { BuilderSpec } from "@/server/workflows/builder";

// v1.8.0: page access, the signed page address, custom approval step
// options and set-up, and the two approved lists.
describe("pageForPath", () => {
  it("finds the page by the longest match, including its API routes", () => {
    expect(pageForPath("/users")?.key).toBe("users.overview");
    expect(pageForPath("/users/requests")?.key).toBe("users.requests");
    expect(pageForPath("/users/requests/42")?.key).toBe("users.request");
    expect(pageForPath("/users/requests/42/amend?x=1")?.key).toBe("users.request");
    expect(pageForPath("/users/approved")?.key).toBe("users.approved");
    expect(pageForPath("/users/approved-by-me")?.key).toBe("users.approved_by_me");
    expect(pageForPath("/api/requests/42/summary.pdf")?.key).toBe("users.request");
    expect(pageForPath("/api/reports/request_register")?.key).toBe("admin.reports");
    expect(pageForPath("/users/reports/x")?.key).toBe("admin.reports");
    expect(pageForPath("/admin/workflows/7/compare")?.key).toBe("admin.workflows");
    expect(pageForPath("/superadmin/settings")).toBeNull();
    expect(pageForPath("/users/requestsX")).toBeNull();
  });
  it("every page has a unique key and at least one address", () => {
    expect(new Set(PAGES.map((page) => page.key)).size).toBe(PAGES.length);
    expect(PAGES.every((page) => page.paths.length > 0)).toBe(true);
  });
});

describe("effectiveLevel", () => {
  const rules = [
    { pageKey: "users.calendar", scope: "EVERYONE" as const, scopeId: 0, level: "HIDDEN" as const },
    { pageKey: "users.calendar", scope: "DEPARTMENT" as const, scopeId: 5, level: "VIEW" as const },
    { pageKey: "users.calendar", scope: "USER" as const, scopeId: 9, level: "FULL" as const },
    { pageKey: "users.overview", scope: "EVERYONE" as const, scopeId: 0, level: "HIDDEN" as const },
  ];
  it("person over department over everyone; no rule = Full", () => {
    expect(effectiveLevel("users.calendar", rules, { id: 9, departmentId: 5 })).toBe("FULL");
    expect(effectiveLevel("users.calendar", rules, { id: 8, departmentId: 5 })).toBe("VIEW");
    expect(effectiveLevel("users.calendar", rules, { id: 8, departmentId: null })).toBe("HIDDEN");
    expect(effectiveLevel("users.search", rules, { id: 8, departmentId: 5 })).toBe("FULL");
  });
  it("a space's first page is never hidden (at most view-only)", () => {
    expect(effectiveLevel("users.overview", rules, { id: 1, departmentId: null })).toBe("VIEW");
  });
});

describe("signed page address", () => {
  it("verifies only the same address with the same secret", async () => {
    const secret = "s".repeat(40);
    const signature = await signPath("/users/calendar", secret);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyPath("/users/calendar", signature, secret)).toBe(true);
    expect(await verifyPath("/users/search", signature, secret)).toBe(false);
    expect(await verifyPath("/users/calendar", signature, "t".repeat(40))).toBe(false);
    expect(await verifyPath("/users/calendar", null, secret)).toBe(false);
    expect(await signPath("/x", undefined)).toBeNull();
  });
});

describe("custom approval step options", () => {
  const spec: BuilderSpec = {
    stages: [
      { kind: "STEP", step: { id: "a", label: "A", approvers: { kind: "PEOPLE", userIds: [1] }, rule: "ALL", slaHours: 4, onNoApprover: "BLOCK" } },
      { kind: "PARALLEL", id: "p", steps: [{ id: "b", label: "B", approvers: { kind: "PEOPLE", userIds: [2] }, rule: "ANY_N", n: 2 }] },
      { kind: "STEP", step: { id: "c", label: "C", type: "NOTIFY", approvers: { kind: "PEOPLE", userIds: [3] }, rule: "ALL" } },
    ],
  } as BuilderSpec;
  it("defaults leave everything as sent", () => {
    expect(applyStepPolicy(spec, DEFAULT_STEP_POLICY)).toEqual(spec);
    expect(stepDefaults(DEFAULT_STEP_POLICY)).toEqual({ rule: "ALL", slaHours: null, onNoApprover: "BLOCK" });
  });
  it("fixed options overwrite every step (not FYIs)", () => {
    const policy = parseStepPolicy({ rule: { value: "ANY_ONE", editable: false }, slaHours: { value: 24, editable: false }, onNoApprover: { value: "SKIP", editable: false } });
    const fixed = applyStepPolicy(spec, policy);
    const steps = [(fixed.stages[0] as { step: Record<string, unknown> }).step, (fixed.stages[1] as { steps: Record<string, unknown>[] }).steps[0]!];
    for (const step of steps) expect(step).toMatchObject({ rule: "ANY_ONE", slaHours: 24, onNoApprover: "SKIP" });
    expect(steps[1]!.n).toBeUndefined();
    expect((fixed.stages[2] as { step: Record<string, unknown> }).step).toEqual((spec.stages[2] as { step: Record<string, unknown> }).step);
  });
  it("bad stored values fall back to the defaults", () => {
    expect(parseStepPolicy("not json")).toEqual(DEFAULT_STEP_POLICY);
    expect(parseStepPolicy({ rule: { value: "EVERYONE" } })).toEqual(DEFAULT_STEP_POLICY);
  });
  it("the set-up rejects reserved keys and broken forms", () => {
    expect(checkCustomConfig(DEFAULT_CUSTOM_FORM)).toEqual([]);
    expect(checkCustomConfig([{ key: "title", label: "Title", type: "TEXT", required: false }]).join(" ")).toMatch(/used by the page itself/);
    expect(checkCustomConfig([{ key: "pick", label: "Pick", type: "CHOICE", required: false, options: ["only one"] }]).join(" ")).toMatch(/at least two choices/);
  });
});

describe("approved lists (v1.8.0)", () => {
  it("My approved requests: validity tabs, approved by, amended; no status or waiting filters", () => {
    const f = parseListFilters({ tab: "expired", approvedBy: "4", amended: "yes", status: "REJECTED", step: "X", raisedBy: "3", sort: "approved" }, "APPROVED_MINE");
    expect(f).toMatchObject({ tab: "expired", approvedById: 4, amended: true, statuses: [], step: null, requesterId: null, sort: "approved" });
    expect(tabsFor("APPROVED_MINE").map((tab) => tab.key)).toEqual(["all", "valid", "expiring", "expired", "noexpiry", "amended"]);
    const sql = listFilterSql(f, "APPROVED_MINE", 7);
    expect(sql.where.join(" ")).toContain("r.valid_until <= CURRENT_TIMESTAMP");
    expect(sql.params).toEqual([4, 4]);
    expect(listQuery(f, {}, "APPROVED_MINE")).toEqual({ tab: "expired", approvedBy: "4", amended: "yes" });
  });
  it("Approved by me: my step, for someone else, my decision dates; bound to my id", () => {
    const f = parseListFilters({ tab: "behalf", myStep: "HOD", onBehalf: "no", mineFrom: "2026-10-05", mineTo: "2026-10-01", raisedBy: "3", sort: "mine" }, "APPROVED_BY_ME");
    expect(f).toMatchObject({ myStep: "HOD", onBehalf: false, mineFrom: "2026-10-01", mineTo: "2026-10-05", requesterId: 3, sort: "mine" });
    const sql = listFilterSql(f, "APPROVED_BY_ME", 77);
    expect(sql.params).toEqual([77, 3, 77, "HOD", 77, 77, "2026-10-01", 77, "2026-10-05"]);
    expect(sql.orderBy).toContain("md.decided_by = 77");
    expect(parseListFilters({ sort: "mine" }, "MINE").sort).toBe("newest");
  });
});
