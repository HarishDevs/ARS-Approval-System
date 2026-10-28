import { describe, expect, it } from "vitest";
import { conditionHolds, conditionsMatch, describeStage, renderTemplate, ruleSchema, stageSendDue, type Stage } from "@/server/notifications/rule-model";

// D-209: reminder and escalation rules (pure parts).
const hours = (n: number) => n * 3_600_000;
const at = (base: Date, h: number) => new Date(base.getTime() + hours(h));
const start = new Date("2026-10-28T04:30:00Z");

describe("conditions on any field", () => {
  const record = { type: "Purchase request", "form.amount": "6,50,000", priority: "HIGH", status: "OPEN", "form.vendor": "Tata Steel", empty: "" };
  it("text ignores capitals; numbers compare as numbers (Indian commas too)", () => {
    expect(conditionHolds({ field: "type", op: "EQ", value: "purchase REQUEST" }, record)).toBe(true);
    expect(conditionHolds({ field: "form.amount", op: "GT", value: "500000" }, record)).toBe(true);
    expect(conditionHolds({ field: "form.amount", op: "LE", value: "500000" }, record)).toBe(false);
    expect(conditionHolds({ field: "priority", op: "IN", value: "high, urgent" }, record)).toBe(true);
    expect(conditionHolds({ field: "form.vendor", op: "CONTAINS", value: "tata" }, record)).toBe(true);
    expect(conditionHolds({ field: "empty", op: "EMPTY", value: "" }, record)).toBe(true);
    expect(conditionHolds({ field: "missing", op: "NOT_EMPTY", value: "" }, record)).toBe(false);
    expect(conditionHolds({ field: "missing", op: "NE", value: "x" }, record)).toBe(true);
    expect(conditionHolds({ field: "type", op: "GT", value: "5" }, record)).toBe(false); // text can't be "more than"
  });
  it("all or any; no conditions means every record", () => {
    const conditions = [
      { field: "priority", op: "EQ" as const, value: "LOW" },
      { field: "status", op: "EQ" as const, value: "OPEN" },
    ];
    expect(conditionsMatch({ match: "ALL", conditions }, record)).toBe(false);
    expect(conditionsMatch({ match: "ANY", conditions }, record)).toBe(true);
    expect(conditionsMatch({ match: "ALL", conditions: [] }, record)).toBe(true);
  });
});

describe("stages: when a send is due", () => {
  const anchors = { STARTED: start, RAISED: at(start, -10), DUE: at(start, 48) };
  const stage = (change: Partial<Stage>): Stage => ({ anchor: "STARTED", offsetHours: 24, repeatHours: null, maxTimes: 1, recipients: ["ASSIGNEE"], userIds: [], ...change });
  it("once, after the anchor", () => {
    expect(stageSendDue(stage({}), anchors, at(start, 23))).toBeNull();
    expect(stageSendDue(stage({}), anchors, at(start, 24))).toBe(1);
    expect(stageSendDue(stage({}), anchors, at(start, 500))).toBe(1);
  });
  it("repeats up to the limit; missed repeats count as the latest only", () => {
    const repeating = stage({ repeatHours: 12, maxTimes: 3 });
    expect(stageSendDue(repeating, anchors, at(start, 35))).toBe(1);
    expect(stageSendDue(repeating, anchors, at(start, 36))).toBe(2);
    expect(stageSendDue(repeating, anchors, at(start, 1000))).toBe(3);
  });
  it("before the due time; no due time means never", () => {
    expect(stageSendDue(stage({ anchor: "DUE", offsetHours: -4 }), anchors, at(start, 43))).toBeNull();
    expect(stageSendDue(stage({ anchor: "DUE", offsetHours: -4 }), anchors, at(start, 44))).toBe(1);
    expect(stageSendDue(stage({ anchor: "DUE" }), { ...anchors, DUE: null }, at(start, 1000))).toBeNull();
  });
});

describe("rules are checked before saving", () => {
  const base = { name: "Late purchases", kind: "ESCALATION", module: "APPROVAL", stages: [{ anchor: "DUE", offsetHours: 24, recipients: ["ASSIGNEE_MANAGER"] }] };
  it("a valid escalation is accepted with defaults", () => {
    const parsed = ruleSchema.parse(base);
    expect(parsed).toMatchObject({ active: true, match: "ALL", email: true, conditions: [] });
    expect(parsed.stages[0]).toMatchObject({ maxTimes: 1, repeatHours: null, userIds: [] });
  });
  it("needs recipients, a value for each condition, 'before' only with the due time, and a repeat interval", () => {
    const errors = (input: unknown) => (ruleSchema.safeParse(input).error?.issues ?? []).map((issue) => issue.message);
    expect(errors({ ...base, stages: [{ anchor: "DUE", offsetHours: 1, recipients: [] }] })).toContain("Stage 1: choose who gets it.");
    expect(errors({ ...base, stages: [{ anchor: "STARTED", offsetHours: -2, recipients: ["ASSIGNEE"] }] })).toContain('Stage 1: "before" works only with the due time.');
    expect(errors({ ...base, stages: [{ anchor: "STARTED", offsetHours: 2, maxTimes: 3, recipients: ["ASSIGNEE"] }] })).toContain("Stage 1: set how often it repeats.");
    expect(errors({ ...base, conditions: [{ field: "type", op: "EQ", value: "" }] })).toContain("Condition 1: enter a value.");
    expect(errors({ ...base, stages: [] })).toContain("Add at least one stage.");
  });
});

describe("message and description", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(renderTemplate("{{ref}} at {{step}} for {{ hours_pending }} h {{unknown}}", { ref: "PUR-1", step: "Finance", hours_pending: "30" })).toBe("PUR-1 at Finance for 30 h {{unknown}}");
  });
  it("describes a stage in words", () => {
    expect(describeStage({ anchor: "DUE", offsetHours: -4, repeatHours: null, maxTimes: 1, recipients: ["ASSIGNEE"], userIds: [7] })).toBe("4 h before its due time → the approver / assignee, 1 named person");
    expect(describeStage({ anchor: "STARTED", offsetHours: 24, repeatHours: 12, maxTimes: 3, recipients: ["ASSIGNEE_MANAGER"], userIds: [] })).toBe("24 h after it reached the person, then every 12 h (up to 3 times) → their manager");
  });
});
