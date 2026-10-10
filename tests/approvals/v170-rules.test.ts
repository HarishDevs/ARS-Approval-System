import { describe, expect, it } from "vitest";
import { expiryState } from "@/server/approvals/expiry-rules";
import { monthGrid, neededByOf, parseMonth, shiftMonth } from "@/server/approvals/calendar-rules";
import { diagnoseState } from "@/server/ops/repair-rules";
import { parseDraftKey } from "@/server/drafts/rules";
import { checkFormDefinition, type FormField } from "@/server/forms/fields";
import { parseTypeSettings } from "@/server/workflows/type-settings";
import type { InstanceState } from "@/server/engine/types";

// v1.7.0 list A: the database-free rules.
describe("A1 expiryState", () => {
  const now = new Date("2026-10-10T06:00:00Z");
  it("NONE without a date, then VALID, EXPIRING (last 7 days), EXPIRED", () => {
    expect(expiryState(null, now)).toBe("NONE");
    expect(expiryState("not a date", now)).toBe("NONE");
    expect(expiryState(new Date("2026-11-30T00:00:00Z"), now)).toBe("VALID");
    expect(expiryState(new Date("2026-10-16T00:00:00Z"), now)).toBe("EXPIRING");
    expect(expiryState(new Date("2026-10-10T06:00:00Z"), now)).toBe("EXPIRED");
  });
});

describe("A2 calendar rules", () => {
  const form: FormField[] = [
    { key: "a", label: "A", type: "DATE", required: false },
    { key: "need", label: "Need", type: "DATE", required: false, neededBy: true },
  ];
  it("reads the needed-by date only from the marked date field", () => {
    expect(neededByOf(form, { a: "2026-01-01", need: "2026-10-20" })).toBe("2026-10-20");
    expect(neededByOf(form, { need: "soon" })).toBeNull();
    expect(neededByOf([form[0]!], { a: "2026-01-01" })).toBeNull();
  });
  it("months: parse, shift across years, Monday-first grid", () => {
    expect(parseMonth("2026-13", new Date("2026-10-10T00:00:00Z"))).toBe("2026-10");
    expect(parseMonth("2027-02")).toBe("2027-02");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    const grid = monthGrid("2026-10"); // 1 Oct 2026 is a Thursday
    expect(grid[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });
});

describe("A6 diagnoseState", () => {
  const state = (over: Partial<InstanceState>): InstanceState =>
    ({
      status: "IN_PROGRESS",
      round: 1,
      nodes: { a: { status: "ACTIVE" } },
      tasks: [{ id: "t1", nodeId: "a", approverId: 5, status: "PENDING", round: 1, createdAt: "2026-10-10T00:00:00Z" }],
      ...over,
    }) as unknown as InstanceState;
  it("OK when rows match", () => {
    expect(diagnoseState(state({}), [{ taskKey: "t1", status: "PENDING" }])).toEqual({ kind: "OK" });
  });
  it("finds missing, mismatched and orphan rows", () => {
    expect(diagnoseState(state({}), [])).toMatchObject({ kind: "TASKS_OUT_OF_STEP", missingKeys: ["t1"] });
    expect(diagnoseState(state({}), [{ taskKey: "t1", status: "APPROVED" }])).toMatchObject({ mismatchedKeys: ["t1"] });
    expect(diagnoseState(state({}), [{ taskKey: "t1", status: "PENDING" }, { taskKey: "x", status: "PENDING" }])).toMatchObject({ orphanKeys: ["x"] });
  });
  it("no open step can't be fixed by a button", () => {
    expect(diagnoseState(state({ nodes: { a: { status: "APPROVED" } } as never }), [])).toEqual({ kind: "NO_OPEN_STEP" });
  });
});

describe("A8 / A10 / A11 settings and keys", () => {
  it("a heading can't be confidential; other fields can", () => {
    expect(checkFormDefinition([{ key: "h", label: "Head", type: "SECTION", required: false, confidential: true }]).join(" ")).toMatch(/can't be confidential/);
    expect(checkFormDefinition([{ key: "s", label: "Salary", type: "NUMBER", required: false, confidential: true }])).toEqual([]);
  });
  it("old type settings still parse, with scope ANY and no unique fields", () => {
    const settings = parseTypeSettings({ duplicates: { fields: ["amount"], windowDays: 30, policy: "WARN" } });
    expect(settings.duplicates.scope).toBe("ANY");
    expect(settings.unique.fields).toEqual([]);
  });
  it("amendment draft keys", () => {
    expect(parseDraftKey("AM:42")).toEqual({ kind: "AMENDMENT", originalId: 42, key: "AM:42" });
    expect(parseDraftKey("AM:x")).toBeNull();
    expect(parseDraftKey("WF:7")).toMatchObject({ kind: "WORKFLOW", workflowId: 7 });
  });
});
