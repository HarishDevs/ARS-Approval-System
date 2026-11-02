"use client";

import type { FormField } from "@/server/forms/fields";

// D-242 (Configuration Studio: one condition builder): one row of a rule:
// field, test, then the value box that fits the field's type. Used by the
// one rule editor (features/admin/conditions/RuleEditor.tsx), which since
// 2 Nov 2026 serves a workflow's skip and choice rules and a form field's
// "show only when" / "required when", all saved in one shape.
export function ConditionRow({
  fields,
  fieldKey,
  onField,
  operators,
  operator,
  onOperator,
  value,
  prefix,
  labels,
  className = "",
}: {
  fields: readonly FormField[];
  fieldKey: string;
  onField: (key: string) => void;
  operators: readonly (readonly [string, string])[]; // [stored value, words]
  operator: string;
  onOperator: (operator: string) => void;
  value?: React.ReactNode; // left out when the test needs no value
  prefix?: string;
  labels: { field: string; operator: string };
  className?: string;
}) {
  const known = fields.some((field) => field.key === fieldKey);
  return (
    <div className={`flex flex-wrap items-center gap-2 text-label ${className}`} data-testid="condition-row">
      {prefix && <span className="font-medium">{prefix}</span>}
      <select value={fieldKey} onChange={(event) => onField(event.target.value)} className={`field-input w-auto min-w-0 ${known ? "" : "border-danger-600"}`} aria-label={labels.field}>
        {!known && <option value={fieldKey}>{fieldKey ? `${fieldKey} (not on the form)` : "Choose a field…"}</option>}
        {fields.map((field) => (
          <option key={field.key} value={field.key}>
            {field.label || field.key}
          </option>
        ))}
      </select>
      <select value={operator} onChange={(event) => onOperator(event.target.value)} className="field-input w-auto" aria-label={labels.operator}>
        {operators.map(([stored, words]) => (
          <option key={stored} value={stored}>
            {words}
          </option>
        ))}
      </select>
      {value}
    </div>
  );
}
