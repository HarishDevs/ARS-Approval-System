"use client";

import { ConditionRow } from "@/features/admin/conditions/ConditionRow";
import { NumberDraftInput } from "@/features/admin/form-designer/FieldProperties";
import { isConditionGroup, operatorNeedsValue, upgradeRule, type RuleComparison, type RuleCondition, type StoredRule } from "@/server/conditions/rule";
import { NUMERIC_TYPES, type FieldLookups, type FormField } from "@/server/forms/fields";
import { PersonSelect } from "@/features/ui/PersonSelect";

// One condition editor for every rule on the platform (owner, 2 Nov 2026:
// "merge them into one editor used everywhere"): a workflow's skip and
// choice rules, and a form field's "show only when" / "required when". All
// of them save the same shape (server/conditions/rule.ts): one condition, or
// several joined by "all of" / "any of" (D-099). One row is saved as a plain
// condition. An older form rule is shown converted and saved converted.

type Operator = RuleComparison["operator"];
type ConditionValue = string | number;

const ALL: Record<string, [Operator, string][]> = {
  NUMBER: [
    ["GT", "is more than"],
    ["GTE", "is at least"],
    ["LT", "is less than"],
    ["LTE", "is at most"],
    ["EQ", "is"],
    ["NEQ", "is not"],
    ["IS_EMPTY", "is empty"],
    ["IS_NOT_EMPTY", "is filled in"],
  ],
  DATE: [
    ["LT", "is before"],
    ["LTE", "is on or before"],
    ["GT", "is after"],
    ["GTE", "is on or after"],
    ["EQ", "is"],
    ["IS_EMPTY", "is empty"],
    ["IS_NOT_EMPTY", "is filled in"],
  ],
  OTHER: [
    ["EQ", "is"],
    ["NEQ", "is not"],
    ["IS_EMPTY", "is empty"],
    ["IS_NOT_EMPTY", "is filled in"],
  ],
};

export function operatorsFor(field: FormField | undefined): [Operator, string][] {
  if (!field) return ALL.NUMBER!;
  return ALL[NUMERIC_TYPES.includes(field.type) ? "NUMBER" : field.type === "DATE" ? "DATE" : "OTHER"]!;
}

export function needsValue(operator: Operator): boolean {
  return operatorNeedsValue(operator);
}

// A starting condition for a field: its first operator and no value yet.
export function freshCondition(field: FormField | undefined): { field: string; operator: Operator; value: ConditionValue } {
  return { field: field?.key ?? "", operator: operatorsFor(field)[0]![0], value: "" };
}

export function ConditionValueInput({
  field,
  value,
  onChange,
  lookups,
  people,
  label = "Value",
}: {
  field: FormField | undefined;
  value: string | number | boolean | (string | number)[] | undefined;
  onChange: (value: ConditionValue) => void;
  lookups?: FieldLookups; // without them a list or person field takes typed text
  people?: { id: number; label: string; detail?: string }[];
  label?: string;
}) {
  const current = Array.isArray(value) ? value[0] : value;
  const select = (items: { value: string; label: string }[], numeric = false) => (
    <select
      aria-label={label}
      value={current === undefined || current === null ? "" : String(current)}
      onChange={(event) => onChange(numeric ? Number(event.target.value) : event.target.value)}
      className="field-input w-auto min-w-40"
    >
      <option value="">Choose…</option>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
  const text = <input aria-label={label} value={current === undefined || current === null ? "" : String(current)} onChange={(event) => onChange(event.target.value)} className="field-input w-48" />;
  switch (field?.type) {
    case "CALC":
    case "LINE_ITEMS":
    case "CURRENCY":
    case "NUMBER":
      return <NumberDraftInput label={label} value={typeof current === "number" ? current : undefined} onChange={(next) => onChange(next ?? "")} placeholder="e.g. 500000" className="field-input w-40" />;
    case "DATE":
      return <input aria-label={label} type="date" value={typeof current === "string" ? current : ""} onChange={(event) => onChange(event.target.value)} className="field-input w-auto" />;
    case "CHOICE":
    case "RADIO":
    case "MULTI_CHOICE":
      return select((field.options ?? []).map((option) => ({ value: option, label: option })));
    case "LOOKUP":
      return lookups ? select((field.source ? lookups[field.source] : []).map((option) => ({ value: option.code, label: `${option.name} (${option.code})` }))) : text;
    case "PERSON":
      return people ? (
        <PersonSelect
          ariaLabel={label}
          options={people}
          value={typeof current === "number" || (typeof current === "string" && /^\d+$/.test(current)) ? Number(current) : null}
          // As the list did: the empty choice stores 0 (Number of "").
          onChange={(id) => onChange(id ?? 0)}
          emptyLabel="Choose…"
          className="w-auto min-w-40"
        />
      ) : (
        text
      );
    default:
      return text;
  }
}

export interface RuleEditorLabels {
  field: string;
  operator: string;
  value: string;
}

// The whole rule: the "all / any" choice once there are two or more rows,
// the rows (field, test, value), remove and add.
export function RuleEditor({
  fields,
  value,
  onChange,
  prefix = "",
  labels = { field: "Field", operator: "Condition", value: "Value" },
  lookups,
  people,
}: {
  fields: readonly FormField[];
  value: StoredRule;
  onChange: (value: RuleCondition) => void;
  prefix?: string;
  labels?: RuleEditorLabels;
  lookups?: FieldLookups;
  people?: { id: number; label: string; detail?: string }[];
}) {
  const rule = upgradeRule(value) as RuleCondition;
  const rows: RuleComparison[] = isConditionGroup(rule) ? rule.conditions : [rule];
  const match = isConditionGroup(rule) ? rule.match : "ALL";
  const save = (next: RuleComparison[], nextMatch: "ALL" | "ANY" = match) => onChange(next.length === 1 ? next[0]! : { match: nextMatch, conditions: next });
  return (
    <div className="space-y-2">
      {rows.length > 1 && (
        <select aria-label="Which conditions must hold" value={match} onChange={(event) => save(rows, event.target.value as "ALL" | "ANY")} className="field-input w-auto text-label">
          <option value="ALL">All of these are true</option>
          <option value="ANY">Any one of these is true</option>
        </select>
      )}
      {rows.map((row, index) => {
        const field = fields.find((item) => item.key === row.field);
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <ConditionRow
              fields={fields}
              fieldKey={row.field}
              onField={(key) => save(rows.map((item, i) => (i === index ? freshCondition(fields.find((other) => other.key === key)) : item)))}
              operators={operatorsFor(field)}
              operator={row.operator}
              onOperator={(operator) => save(rows.map((item, i) => (i === index ? { ...item, operator: operator as Operator } : item)))}
              prefix={index === 0 ? prefix : match === "ALL" ? "and" : "or"}
              labels={{ field: labels.field, operator: labels.operator }}
              value={
                needsValue(row.operator) ? (
                  <ConditionValueInput field={field} value={row.value} onChange={(next) => save(rows.map((item, i) => (i === index ? { ...item, value: next } : item)))} lookups={lookups} people={people} label={labels.value} />
                ) : undefined
              }
            />
            {rows.length > 1 && (
              <button type="button" onClick={() => save(rows.filter((_, i) => i !== index))} className="btn-secondary btn-compact" aria-label={`Remove condition ${index + 1}`}>
                ×
              </button>
            )}
          </div>
        );
      })}
      {rows.length < 10 && (
        <button type="button" onClick={() => save([...rows, freshCondition(fields[0])])} className="link text-label">
          + Add another condition
        </button>
      )}
    </div>
  );
}
