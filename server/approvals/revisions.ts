import type { FormField } from "@/server/forms/fields";

// RD-03: what changed between two rounds of a request. Pure. Values are
// compared as shown to people (displayValue), so "1,00,000" and 100000 are
// the same. A field only in one round is added or removed.
export interface FieldChange {
  key: string;
  label: string;
  kind: "changed" | "added" | "removed";
  before: string;
  after: string;
}

export function diffRounds(
  form: readonly FormField[],
  before: { title: string; fields: Record<string, unknown> },
  after: { title: string; fields: Record<string, unknown> },
  show: (field: FormField, value: unknown) => string,
): FieldChange[] {
  const changes: FieldChange[] = [];
  if (before.title !== after.title) changes.push({ key: "title", label: "Title", kind: "changed", before: before.title, after: after.title });
  const empty = (value: unknown) => value === undefined || value === null || value === "";
  for (const field of form) {
    const was = before.fields[field.key];
    const now = after.fields[field.key];
    if (empty(was) && empty(now)) continue;
    const a = empty(was) ? "" : show(field, was);
    const b = empty(now) ? "" : show(field, now);
    if (a === b) continue;
    changes.push({ key: field.key, label: field.label, kind: empty(was) ? "added" : empty(now) ? "removed" : "changed", before: a, after: b });
  }
  return changes;
}
