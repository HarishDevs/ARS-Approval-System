import type { Comparison, Condition, ConditionGroup, FormData, ScalarValue } from "@/server/engine/types";

// Evaluates edge / skip conditions against the request's form data.

export function isGroup(condition: Condition): condition is ConditionGroup {
  return "op" in condition;
}

function isEmpty(value: unknown): boolean {
  // Whitespace-only text counts as blank, as it does on the form.
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normalise(value: unknown): string {
  return String(value).trim().toLowerCase();
}

function equals(a: unknown, b: unknown): boolean {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na === nb;
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  return normalise(a) === normalise(b);
}

function asList(value: ScalarValue | ScalarValue[] | undefined): ScalarValue[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;
const isDateText = (value: unknown): value is string => typeof value === "string" && DATE_TEXT.test(value);

export function evaluateComparison(comparison: Comparison, formData: FormData): boolean {
  const actual = formData[comparison.field];
  switch (comparison.operator) {
    case "IS_EMPTY":
      return isEmpty(actual);
    case "IS_NOT_EMPTY":
      return !isEmpty(actual);
    case "EQ":
      return !isEmpty(actual) && asList(actual).some((item) => equals(item, comparison.value));
    case "NEQ":
      return isEmpty(actual) || asList(actual).every((item) => !equals(item, comparison.value));
    case "IN":
      return asList(actual).some((item) => asList(comparison.value).some((option) => equals(item, option)));
    case "NOT_IN":
      return asList(actual).every((item) => !asList(comparison.value).some((option) => equals(item, option)));
    case "CONTAINS":
      return (
        !isEmpty(actual) &&
        asList(actual).some((item) => normalise(item).includes(normalise(comparison.value ?? "")))
      );
    case "GT":
    case "GTE":
    case "LT":
    case "LTE": {
      // Dates (YYYY-MM-DD) order as text (S12-04); anything else as numbers.
      if (isDateText(actual) && isDateText(comparison.value)) {
        const order = actual < comparison.value ? -1 : actual > comparison.value ? 1 : 0;
        if (comparison.operator === "GT") return order > 0;
        if (comparison.operator === "GTE") return order >= 0;
        if (comparison.operator === "LT") return order < 0;
        return order <= 0;
      }
      const left = toNumber(actual);
      const right = toNumber(comparison.value);
      if (left === null || right === null) return false;
      if (comparison.operator === "GT") return left > right;
      if (comparison.operator === "GTE") return left >= right;
      if (comparison.operator === "LT") return left < right;
      return left <= right;
    }
  }
}

export function evaluateCondition(condition: Condition, formData: FormData): boolean {
  if (isGroup(condition)) {
    return condition.op === "AND"
      ? condition.conditions.every((child) => evaluateCondition(child, formData))
      : condition.conditions.some((child) => evaluateCondition(child, formData));
  }
  return evaluateComparison(condition, formData);
}

export function collectFields(condition: Condition, into: Set<string> = new Set()): Set<string> {
  if (isGroup(condition)) condition.conditions.forEach((child) => collectFields(child, into));
  else into.add(condition.field);
  return into;
}
