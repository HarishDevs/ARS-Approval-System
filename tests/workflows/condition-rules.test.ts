import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  conditionSpecSchema,
  convertLegacyRule,
  describeRule,
  isConditionGroup,
  isLegacyRule,
  LEGACY_RULE_OPERATORS,
  legacyValue,
  ruleFields,
  ruleHolds,
  toCondition,
  upgradeFormRules,
  upgradeRule,
  type LegacyFieldRule,
  type RuleCondition,
} from "@/server/conditions/rule";
import { formFieldSchema } from "@/server/forms/fields";
import { isConditionGroup as builderIsGroup, toCondition as builderToCondition } from "@/server/workflows/builder";

// 2 Nov 2026 (owner): one rule shape everywhere; older form rules are
// converted once by migration and on every read until then.

// The form designer's evaluator as it was before the merge (server/forms/
// dynamic.ts, v1.6.0 to v1.39.0), kept here verbatim as the reference the
// conversion must match.
type V = string | number | boolean | null | undefined | readonly (string | number)[];
const oldIsEmpty = (value: V) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
const oldAsNumber = (value: V): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (cleaned === "") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
};
function oldRuleHolds(rule: LegacyFieldRule, values: Record<string, V>): boolean {
  const value = values[rule.field];
  if (rule.op === "FILLED") return !oldIsEmpty(value);
  if (rule.op === "EMPTY") return oldIsEmpty(value);
  if (oldIsEmpty(value)) return false;
  const expected = rule.value ?? "";
  if (Array.isArray(value)) {
    const has = value.some((item) => String(item).trim().toLowerCase() === expected.trim().toLowerCase());
    return rule.op === "EQ" ? has : rule.op === "NEQ" ? !has : false;
  }
  if (rule.op === "EQ" || rule.op === "NEQ") {
    const left = oldAsNumber(value);
    const right = oldAsNumber(expected);
    const same = left !== null && right !== null ? left === right : String(value).trim().toLowerCase() === expected.trim().toLowerCase();
    return rule.op === "EQ" ? same : !same;
  }
  const left = oldAsNumber(value);
  const right = oldAsNumber(expected);
  if (left === null || right === null) return false;
  if (rule.op === "GT") return left > right;
  if (rule.op === "GTE") return left >= right;
  if (rule.op === "LT") return left < right;
  return left <= right;
}

describe("convertLegacyRule: every older operator", () => {
  it("FILLED and EMPTY become the engine's blank tests (a stray value is dropped)", () => {
    expect(convertLegacyRule({ field: "kind", op: "FILLED" })).toEqual({ field: "kind", operator: "IS_NOT_EMPTY" });
    expect(convertLegacyRule({ field: "kind", op: "EMPTY", value: "x" })).toEqual({ field: "kind", operator: "IS_EMPTY" });
  });

  it("EQ, GT, GTE, LT and LTE keep their operator; numbers become numbers", () => {
    expect(convertLegacyRule({ field: "kind", op: "EQ", value: "Capex" })).toEqual({ field: "kind", operator: "EQ", value: "Capex" });
    expect(convertLegacyRule({ field: "amount", op: "GT", value: "1,00,000" })).toEqual({ field: "amount", operator: "GT", value: 100000 });
    expect(convertLegacyRule({ field: "amount", op: "GTE", value: "₹ 5,000.50" })).toEqual({ field: "amount", operator: "GTE", value: 5000.5 });
    expect(convertLegacyRule({ field: "amount", op: "LT", value: "-3" })).toEqual({ field: "amount", operator: "LT", value: -3 });
    expect(convertLegacyRule({ field: "amount", op: "LTE", value: "0" })).toEqual({ field: "amount", operator: "LTE", value: 0 });
  });

  it("NEQ becomes 'is filled in AND is not' (the older test was false while blank)", () => {
    expect(convertLegacyRule({ field: "kind", op: "NEQ", value: "Capex" })).toEqual({
      match: "ALL",
      conditions: [
        { field: "kind", operator: "IS_NOT_EMPTY" },
        { field: "kind", operator: "NEQ", value: "Capex" },
      ],
    });
  });

  it("covers all eight older operators, and every result is a valid rule", () => {
    for (const op of LEGACY_RULE_OPERATORS) {
      const converted = convertLegacyRule({ field: "f", op, value: "7" });
      expect(conditionSpecSchema.safeParse(converted).success, op).toBe(true);
      expect(isLegacyRule(converted), op).toBe(false);
    }
  });
});

describe("legacyValue", () => {
  it("turns grouped numbers into numbers and leaves everything else as text", () => {
    expect(legacyValue("1,00,000")).toBe(100000);
    expect(legacyValue(" 2 500 ")).toBe(2500);
    expect(legacyValue("12.75")).toBe(12.75);
    expect(legacyValue("Capex")).toBe("Capex");
    expect(legacyValue("007")).toBe("007"); // not a plain JSON number; compared as a number by the engine anyway
    expect(legacyValue("1.")).toBe("1.");
    expect(legacyValue("2026-11-02")).toBe("2026-11-02");
    expect(legacyValue("")).toBe("");
    expect(legacyValue(undefined)).toBe("");
  });
});

describe("isLegacyRule / upgradeRule", () => {
  it("knows the older shape and nothing else", () => {
    expect(isLegacyRule({ field: "a", op: "EQ", value: "x" })).toBe(true);
    expect(isLegacyRule({ field: "a", operator: "EQ", value: "x" })).toBe(false);
    expect(isLegacyRule({ match: "ALL", conditions: [] })).toBe(false);
    expect(isLegacyRule({ op: "AND", conditions: [] })).toBe(false); // an engine group
    expect(isLegacyRule({ field: "a", op: "LIKE" })).toBe(false);
    expect(isLegacyRule({ field: "a", op: "EQ", operator: "EQ" })).toBe(false);
    expect(isLegacyRule(null)).toBe(false);
    expect(isLegacyRule(undefined)).toBe(false);
    expect(isLegacyRule([{ field: "a", op: "EQ" }])).toBe(false);
    expect(isLegacyRule("EQ")).toBe(false);
  });

  it("returns a rule already in the one shape untouched (same object), and is idempotent", () => {
    const canonical: RuleCondition = { match: "ANY", conditions: [{ field: "a", operator: "GT", value: 5 }] };
    expect(upgradeRule(canonical)).toBe(canonical);
    for (const op of LEGACY_RULE_OPERATORS) {
      const once = upgradeRule({ field: "f", op, value: "1,000" });
      expect(upgradeRule(once)).toBe(once);
    }
    expect(upgradeRule(undefined)).toBeUndefined();
  });

  it("upgradeFormRules converts both rules of a field and keeps an untouched form the same array", () => {
    const untouched = [{ key: "a", showIf: { field: "b", operator: "IS_EMPTY" } }];
    expect(upgradeFormRules(untouched)).toBe(untouched);
    const [field] = upgradeFormRules([{ key: "a", label: "A", showIf: { field: "b", op: "FILLED" }, requiredIf: { field: "c", op: "GT", value: "10" } }]);
    expect(field).toEqual({ key: "a", label: "A", showIf: { field: "b", operator: "IS_NOT_EMPTY" }, requiredIf: { field: "c", operator: "GT", value: 10 } });
  });
});

describe("evaluation after conversion matches the older evaluator exactly", () => {
  const values: V[] = [undefined, null, "", "Capex", " capex ", "Opex", 0, 5, 150000, "150000", "1,00,000", "₹ 1,50,000", "abc", "2026-11-02", ["Red", "Blue"], ["Capex"], [], [5, 7]];
  const expected: (string | undefined)[] = [undefined, "", "Capex", "capex", "Opex", "0", "5", "1,00,000", "100000", "150,000", "abc", "Red", "2026-11-02", "007", "5.0"];
  it("for every operator × value × expected value", () => {
    let checked = 0;
    for (const op of LEGACY_RULE_OPERATORS) {
      for (const value of values) {
        for (const want of expected) {
          const rule: LegacyFieldRule = { field: "x", op, ...(want === undefined ? {} : { value: want }) };
          const data = { x: value };
          // Known difference 2 (below): items of a several-choice answer that are the same number written differently.
          // Difference 3: dates now order as dates (older forms refused "more/less than" on a date field, so no saved rule has it).
          if (["GT", "GTE", "LT", "LTE"].includes(op) && value === "2026-11-02" && want === "2026-11-02") continue;
          if (Array.isArray(value) && value.length && want !== undefined && ["007", "5.0"].includes(want) && value.some((item) => typeof item === "number")) continue;
          expect(ruleHolds(rule, data), `${op} ${JSON.stringify(want)} on ${JSON.stringify(value)} (on the fly)`).toBe(oldRuleHolds(rule, data));
          expect(ruleHolds(convertLegacyRule(rule), data), `${op} ${JSON.stringify(want)} on ${JSON.stringify(value)} (converted)`).toBe(oldRuleHolds(rule, data));
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(8 * values.length * (expected.length - 1));
  });

  it("difference 1: text of only spaces now counts as blank, as the engine and the required check treat it", () => {
    expect(oldRuleHolds({ field: "x", op: "FILLED" }, { x: "   " })).toBe(true);
    expect(ruleHolds({ field: "x", op: "FILLED" }, { x: "   " })).toBe(false);
  });

  it("difference 2: items of a several-choice answer now compare as numbers when both are numbers", () => {
    expect(oldRuleHolds({ field: "x", op: "EQ", value: "007" }, { x: [5, 7] })).toBe(false);
    expect(ruleHolds({ field: "x", op: "EQ", value: "007" }, { x: [5, 7] })).toBe(true);
  });
});

describe("the one shape on forms", () => {
  it("a form field's rule may now use all / any and dates", () => {
    const rule: RuleCondition = { match: "ANY", conditions: [{ field: "kind", operator: "EQ", value: "Capex" }, { field: "due", operator: "LT", value: "2026-12-01" }] };
    expect(ruleHolds(rule, { kind: "Opex", due: "2026-11-15" })).toBe(true);
    expect(ruleHolds(rule, { kind: "Opex", due: "2026-12-15" })).toBe(false);
    expect(ruleFields(rule)).toEqual(["kind", "due"]);
    expect(describeRule(rule, (key) => key.toUpperCase())).toBe("KIND is Capex or DUE is less than 2026-12-01");
  });

  it("describes older and converted rules in the same words as before", () => {
    expect(describeRule({ field: "kind", op: "EQ", value: "Capex" }, () => "Kind")).toBe("Kind is Capex");
    expect(describeRule({ field: "kind", op: "FILLED" }, () => "Kind")).toBe("Kind is filled in");
    expect(describeRule({ field: "kind", op: "NEQ", value: "Capex" }, () => "Kind")).toBe("Kind is filled in and Kind is not Capex");
  });

  it("the workflow builder uses the very same shape and helpers", () => {
    expect(builderIsGroup).toBe(isConditionGroup);
    expect(builderToCondition).toBe(toCondition);
  });

  it("the saved-form schema reads an older rule as converted (a database before the migration still loads)", () => {
    const parsed = formFieldSchema.parse({ key: "gst", label: "GST", type: "TEXT", required: false, showIf: { field: "kind", op: "NEQ", value: "Opex" }, requiredIf: { field: "amount", op: "GT", value: "1,000" } });
    expect(parsed.showIf).toEqual(convertLegacyRule({ field: "kind", op: "NEQ", value: "Opex" }));
    expect(parsed.requiredIf).toEqual({ field: "amount", operator: "GT", value: 1000 });
    expect(formFieldSchema.safeParse({ key: "g", label: "G", type: "TEXT", required: false, showIf: { field: "kind", op: "LIKE" } }).success).toBe(false);
  });
});

describe("migration 202611021000_unify_condition_rules.sql", () => {
  const sql = readFileSync(path.join(process.cwd(), "database", "migrations", "202611021000_unify_condition_rules.sql"), "utf8");
  it("touches only rows that still hold an older rule, in each table that stores a form", () => {
    for (const table of ["workflow_versions", "module_type_versions", "custom_approval_settings"]) {
      expect(sql).toContain(`UPDATE ${table}`);
    }
    const updates = sql.split(/;\s*\n/).filter((statement) => /^\s*UPDATE/m.test(statement.replace(/^--.*$/gm, "")));
    expect(updates).toHaveLength(6);
    for (const statement of updates) expect(statement).toMatch(/JSON_CONTAINS_PATH\(x\.form_json, 'one', '\$\[\*\]\.(showIf|requiredIf)\.op'\)/);
  });
  it("uses the same number pattern as the converter", () => {
    expect(sql).toContain("'^-?(0|[1-9][0-9]*)([.][0-9]+)?$'");
  });
});
