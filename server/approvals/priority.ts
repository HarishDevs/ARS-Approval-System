import { isConfidential, OPTION_TYPES, type FormField } from "@/server/forms/fields";
import { optionColor, type OptionColor } from "@/server/forms/option-colors";

// v1.47.0 (owner, 2 Nov 2026: "custom approvals will have priority", "add
// Priority in all possible tables"): a request's priority is the value of
// its form's choice field (Dropdown, Radio buttons or Multi-select) whose key
// is "priority", with that option's colour from the form version the request
// was raised on. Requests whose form has no such field have no priority.
// rank = the option's place in the field's list (0 = first, e.g. Critical),
// so lists sort and group in the order IT configured. Pure.
export interface RequestPriority {
  label: string;
  color: OptionColor | null;
  rank: number;
  confidential: boolean; // the field is confidential (A8)
}

// What a list shows for one request (hidden: confidential for this viewer).
export interface ShownPriority {
  label: string;
  color: OptionColor | null;
  rank: number;
  hidden?: boolean;
}

export const PRIORITY_KEY = "priority";

export const priorityField = (form: readonly FormField[] | null | undefined): FormField | undefined =>
  Array.isArray(form) ? form.find((field) => field?.key?.toLowerCase() === PRIORITY_KEY && OPTION_TYPES.includes(field.type)) : undefined;

export function requestPriority(form: readonly FormField[] | null | undefined, formData: Readonly<Record<string, unknown>> | null | undefined): RequestPriority | null {
  const field = priorityField(form);
  if (!field || !formData) return null;
  const raw = formData[field.key];
  // A multi-select shows what was picked; its first pick gives the colour and order.
  const values = (Array.isArray(raw) ? raw : [raw]).filter((value): value is string => typeof value === "string" && value.trim() !== "");
  if (values.length === 0) return null;
  const first = values[0]!;
  const index = (field.options ?? []).indexOf(first);
  return { label: values.join(", "), color: optionColor(field, first), rank: index >= 0 ? index : Number.MAX_SAFE_INTEGER, confidential: isConfidential(field) };
}

const json = <T,>(value: unknown): T | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

// The same from the database columns (form_json, form_data_json).
export const requestPriorityFromJson = (formJson: unknown, dataJson: unknown): RequestPriority | null => requestPriority(json<FormField[]>(formJson), json<Record<string, unknown>>(dataJson));

// A8 / QA-SEC-01: a confidential priority is shown only to a viewer who may
// see confidential values; others see "Hidden" (as the Records amount does).
export function shownPriority(priority: RequestPriority | null, seeConfidential: boolean): ShownPriority | null {
  if (!priority) return null;
  if (priority.confidential && !seeConfidential) return { label: "Hidden", color: null, rank: Number.MAX_SAFE_INTEGER, hidden: true };
  return { label: priority.label, color: priority.color, rank: priority.rank };
}

// The text for a CSV or PDF cell.
export const priorityText = (priority: ShownPriority | null | undefined): string => priority?.label ?? "";

// SQL: the rank of a request's priority (NULL when it has none, or when the
// field is confidential, so the order gives nothing away). Uses only JSON
// functions (MySQL 5.7+): find the field whose key is "priority", then the
// stored value's place in that field's options. `r` = approval_requests,
// `v` = workflow_versions.
export function priorityRankSql(r = "r", v = "v"): string {
  const path = `SUBSTRING_INDEX(JSON_UNQUOTE(JSON_SEARCH(${v}.form_json, 'one', '${PRIORITY_KEY}', NULL, '$[*].key')), '.', 1)`;
  const value = `JSON_UNQUOTE(JSON_EXTRACT(${r}.form_data_json, '$.${PRIORITY_KEY}'))`;
  const place = `JSON_UNQUOTE(JSON_SEARCH(JSON_EXTRACT(${v}.form_json, CONCAT(${path}, '.options')), 'one', ${value}))`;
  return `(CASE WHEN ${path} IS NULL OR ${value} IS NULL OR JSON_EXTRACT(${v}.form_json, CONCAT(${path}, '.confidential')) = CAST('true' AS JSON) THEN NULL ELSE CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(${place}, '[', -1), ']', 1) AS UNSIGNED) END)`;
}
