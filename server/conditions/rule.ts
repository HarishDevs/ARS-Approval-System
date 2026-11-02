import { z } from "zod";
import { evaluateCondition } from "@/server/engine/conditions";
import type { Comparison, Condition, FormData, ScalarValue } from "@/server/engine/types";

// Owner decision, 2 Nov 2026 ("merge them into one editor used everywhere,
// convert saved rules once"). ONE rule shape for every condition on the
// platform: a workflow's skip and choice rules AND a form field's "show only
// when" / "required when". It is the workflow builder's shape (D-099): one
// comparison, or several joined by "all of" / "any of". The engine evaluates
// it natively (toCondition maps "match" to AND/OR). Pure; used by the browser
// and the server.
//
// The form designer's older shape ({ field, op, value } with FILLED/EMPTY,
// "legacy" below) is converted once by migration
// 202611021000_unify_condition_rules.sql. Until that has run, every read
// converts on the fly (upgradeRule), so a database that is behind still
// evaluates the same way.

export const COMPARISON_OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "CONTAINS", "IS_EMPTY", "IS_NOT_EMPTY"] as const;

export const comparisonSchema = z.object({
  field: z.string().min(1).max(50),
  operator: z.enum(COMPARISON_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

// A rule is one comparison, or several joined by "all of" / "any of"
// (D-099). Old specs hold a single comparison and stay valid.
export const conditionGroupSchema = z.object({
  match: z.enum(["ALL", "ANY"]),
  conditions: z.array(comparisonSchema).min(1, "Add at least one condition.").max(10),
});
export const conditionSpecSchema = z.union([comparisonSchema, conditionGroupSchema]);
export type RuleComparison = z.infer<typeof comparisonSchema>;
export type RuleGroup = z.infer<typeof conditionGroupSchema>;
export type RuleCondition = z.infer<typeof conditionSpecSchema>;

export const isConditionGroup = (condition: RuleCondition): condition is RuleGroup => "match" in condition;

// Rule → engine condition.
export function toCondition(condition: RuleCondition): Condition {
  if (!isConditionGroup(condition)) return condition as Comparison;
  if (condition.conditions.length === 1) return condition.conditions[0] as Comparison;
  return { op: condition.match === "ALL" ? "AND" : "OR", conditions: condition.conditions as Comparison[] };
}

// The comparisons in a rule, in order.
export const ruleComparisons = (condition: RuleCondition): RuleComparison[] => (isConditionGroup(condition) ? condition.conditions : [condition]);

// ---- the older form-field shape and its one-time conversion ------------------------
export const LEGACY_RULE_OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "FILLED", "EMPTY"] as const;
export type LegacyRuleOperator = (typeof LEGACY_RULE_OPERATORS)[number];
export interface LegacyFieldRule {
  field: string;
  op: LegacyRuleOperator;
  value?: string;
}
// What may be found in saved JSON before the migration has run.
export type StoredRule = RuleCondition | LegacyFieldRule;

export function isLegacyRule(rule: unknown): rule is LegacyFieldRule {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return false;
  const record = rule as Record<string, unknown>;
  return typeof record.field === "string" && typeof record.op === "string" && (LEGACY_RULE_OPERATORS as readonly string[]).includes(record.op) && !("operator" in record) && !("match" in record);
}

// A JSON number written without grouping (the migration's SQL uses the same
// pattern, so both turn the same texts into numbers).
const PLAIN_NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

// The older editor saved every value as text and compared numbers after
// removing commas, spaces and ₹ ("1,00,000"). The value is stored as a number
// when it is one, so the engine compares it the same way.
export function legacyValue(value: string | undefined): string | number {
  // Saved JSON is not trusted to be text (the SQL reads it as text too).
  const text = value === undefined || value === null ? "" : String(value);
  const stripped = text.replace(/[,\s₹]/g, "");
  return PLAIN_NUMBER.test(stripped) ? Number(stripped) : text;
}

// Older rule → the one shape. Exact, including blanks: the older "is not"
// was false while the field was blank (the engine's NEQ is true then), so it
// becomes "is filled in AND is not".
export function convertLegacyRule(rule: LegacyFieldRule): RuleCondition {
  const { field, op } = rule;
  switch (op) {
    case "FILLED":
      return { field, operator: "IS_NOT_EMPTY" };
    case "EMPTY":
      return { field, operator: "IS_EMPTY" };
    case "NEQ":
      return {
        match: "ALL",
        conditions: [
          { field, operator: "IS_NOT_EMPTY" },
          { field, operator: "NEQ", value: legacyValue(rule.value) },
        ],
      };
    default:
      return { field, operator: op, value: legacyValue(rule.value) };
  }
}

// Read-time fallback: an older rule is converted, anything else is returned
// as it is (the same object, so a canonical rule is never touched).
export function upgradeRule<T>(rule: T): T | RuleCondition {
  return isLegacyRule(rule) ? convertLegacyRule(rule) : rule;
}

// Upgrades the rules on every field of a form (returns the same array when
// nothing needed converting).
export function upgradeFormRules<F extends { showIf?: unknown; requiredIf?: unknown }>(fields: readonly F[]): F[] {
  let changed = false;
  const next = fields.map((field) => {
    if (!isLegacyRule(field.showIf) && !isLegacyRule(field.requiredIf)) return field;
    changed = true;
    return {
      ...field,
      ...(field.showIf !== undefined ? { showIf: upgradeRule(field.showIf) } : {}),
      ...(field.requiredIf !== undefined ? { requiredIf: upgradeRule(field.requiredIf) } : {}),
    };
  });
  return changed ? next : (fields as F[]);
}

// ---- evaluating a rule against what was filled in -----------------------------------
type InputValue = string | number | boolean | null | undefined | readonly (string | number)[];

// A typed amount ("1,00,000", "₹ 5,000") counts as the number, as it always
// did on forms. Only text that is a number once commas, spaces and ₹ are
// removed is changed.
function formValue(value: InputValue): ScalarValue | ScalarValue[] | undefined {
  if (Array.isArray(value)) return [...value];
  if (typeof value === "string" && /[,\s₹]/.test(value)) {
    const stripped = value.replace(/[,\s₹]/g, "");
    if (PLAIN_NUMBER.test(stripped)) return Number(stripped);
  }
  return value as ScalarValue | undefined;
}

export function ruleHolds(rule: StoredRule, values: Record<string, InputValue>): boolean {
  const condition = upgradeRule(rule) as RuleCondition;
  const data: FormData = {};
  for (const comparison of ruleComparisons(condition)) data[comparison.field] = formValue(values[comparison.field]);
  return evaluateCondition(toCondition(condition), data);
}

// Field keys a rule looks at.
export function ruleFields(rule: StoredRule | undefined): string[] {
  if (!rule) return [];
  return [...new Set(ruleComparisons(upgradeRule(rule) as RuleCondition).map((comparison) => comparison.field))];
}

// ---- words ----------------------------------------------------------------------------
export const OPERATOR_WORDS: Record<RuleComparison["operator"], string> = {
  EQ: "is",
  NEQ: "is not",
  GT: "is more than",
  GTE: "is at least",
  LT: "is less than",
  LTE: "is at most",
  IN: "is one of",
  NOT_IN: "is not one of",
  CONTAINS: "contains",
  IS_EMPTY: "is empty",
  IS_NOT_EMPTY: "is filled in",
};

export const operatorNeedsValue = (operator: RuleComparison["operator"]) => operator !== "IS_EMPTY" && operator !== "IS_NOT_EMPTY";

export function describeRule(rule: StoredRule, labelOf: (key: string) => string): string {
  const condition = upgradeRule(rule) as RuleCondition;
  const parts = ruleComparisons(condition).map((comparison) => {
    const value = Array.isArray(comparison.value) ? comparison.value.join(", ") : String(comparison.value ?? "");
    return `${labelOf(comparison.field)} ${OPERATOR_WORDS[comparison.operator]}${operatorNeedsValue(comparison.operator) ? ` ${value}` : ""}`.trim();
  });
  return parts.join(isConditionGroup(condition) && condition.match === "ANY" ? " or " : " and ");
}
