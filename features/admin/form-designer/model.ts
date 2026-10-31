import { LOOKUP_SOURCES, NUMERIC_TYPES, OPTION_TYPES, type FieldType, type FormField, type LookupSource } from "@/server/forms/fields";
import { formulaFields, parseFormula } from "@/server/forms/dynamic";

// D-235 (Form Designer): the pure rules behind the designer, kept apart from
// the screens so they can be unit-tested. The server still checks the whole
// form again on save (checkFormDefinition); these only guide the person.

export type FieldGroup = "BASIC" | "ADVANCED" | "LAYOUT";
export interface TypeChoice {
  value: string; // a FieldType, or LOOKUP:<source>
  label: string;
  short: string; // the library's name for it
  group: FieldGroup;
}

// The 18 choices people see (LOOKUP is two: departments and designations).
export const TYPE_CHOICES: TypeChoice[] = [
  { value: "TEXT", label: "Short text", short: "Short text", group: "BASIC" },
  { value: "LONG_TEXT", label: "Long text", short: "Long text", group: "BASIC" },
  { value: "NUMBER", label: "Number / amount", short: "Number", group: "BASIC" },
  { value: "DATE", label: "Date", short: "Date", group: "BASIC" },
  { value: "CHOICE", label: "Dropdown (your options)", short: "Dropdown", group: "BASIC" },
  { value: "PERSON", label: "Person", short: "Person", group: "BASIC" },
  { value: "CHECKBOX", label: "Checkbox (yes when ticked)", short: "Checkbox", group: "BASIC" },
  { value: "RADIO", label: "Radio buttons (your options)", short: "Radio buttons", group: "BASIC" },
  { value: "MULTI_CHOICE", label: "Multi-select (your options)", short: "Multi-select", group: "ADVANCED" },
  { value: "CURRENCY", label: "Currency (₹, paise)", short: "Currency (₹)", group: "ADVANCED" },
  { value: "DATETIME", label: "Date and time", short: "Date and time", group: "ADVANCED" },
  { value: "ATTACHMENT", label: "Attachments (files)", short: "Attachments", group: "ADVANCED" },
  { value: "LOOKUP:DEPARTMENT", label: "Department (from the list)", short: "Department", group: "ADVANCED" },
  { value: "LOOKUP:DESIGNATION", label: "Designation (from the list)", short: "Designation", group: "ADVANCED" },
  { value: "CALC", label: "Calculated (formula)", short: "Calculation", group: "ADVANCED" },
  { value: "LINE_ITEMS", label: "Line items (qty × rate + GST)", short: "Line items", group: "ADVANCED" },
  { value: "URL", label: "Web link (URL)", short: "Web link", group: "ADVANCED" },
  { value: "SECTION", label: "Section heading", short: "Section", group: "LAYOUT" },
];
export const GROUP_LABEL: Record<FieldGroup, string> = { BASIC: "Basic fields", ADVANCED: "Advanced fields", LAYOUT: "Layout" };

export const typeValue = (field: FormField): string => (field.type === "LOOKUP" ? `LOOKUP:${field.source ?? "DEPARTMENT"}` : field.type);
export const typeChoice = (field: FormField): TypeChoice | undefined => TYPE_CHOICES.find((choice) => choice.value === typeValue(field));

export function slugKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return /^[a-z]/.test(slug) ? slug : slug ? `f_${slug}`.slice(0, 50) : "";
}

const DEFAULT_TYPES: readonly string[] = ["TEXT", "NUMBER", "CURRENCY", "CHOICE", "RADIO", "DATE", "URL"];

// A default kept through a type change only if it still makes sense there.
function defaultFits(type: FieldType, value: string, options: readonly string[] | undefined): boolean {
  if (!DEFAULT_TYPES.includes(type)) return false;
  if (OPTION_TYPES.includes(type)) return (options ?? []).includes(value);
  if (type === "NUMBER" || type === "CURRENCY") return Number.isFinite(Number(value.replace(/[,\s₹]/g, "")));
  if (type === "DATE") return /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (type === "URL") return /^https?:\/\//i.test(value);
  return true;
}

// A new field of a type (from the library).
export function newField(value: string, taken: readonly string[]): FormField {
  const choice = TYPE_CHOICES.find((item) => item.value === value) ?? TYPE_CHOICES[0]!;
  const blank: FormField = { key: "", label: "", type: "TEXT", required: false };
  const typed = withType(blank, choice.value);
  return choice.value === "SECTION" ? { ...typed, label: "New section", key: uniqueKey("section", taken) } : typed;
}

// The field as another type, keeping everything that still applies.
export function withType(field: FormField, value: string): FormField {
  const [type, source] = value.split(":") as [FieldType, LookupSource | undefined];
  return {
    key: field.key,
    label: field.label,
    required: type === "CALC" || type === "SECTION" ? false : field.required,
    ...(field.help ? { help: field.help } : {}),
    type,
    ...(OPTION_TYPES.includes(type) ? { options: field.options ?? [] } : {}),
    ...((type === "NUMBER" || type === "CURRENCY") && field.min !== undefined ? { min: field.min } : {}),
    ...(type === "LOOKUP" ? { source: source && (LOOKUP_SOURCES as readonly string[]).includes(source) ? source : "DEPARTMENT" } : {}),
    ...(type === "CALC" ? { formula: field.formula ?? "", ...(field.decimals !== undefined ? { decimals: field.decimals } : {}) } : {}),
    ...(type === "ATTACHMENT" ? { maxFiles: field.maxFiles ?? 5 } : {}),
    ...(type === "DATE" && field.neededBy ? { neededBy: true } : {}),
    ...(type !== "SECTION" && field.confidential ? { confidential: true } : {}),
    ...(field.showIf ? { showIf: field.showIf } : {}),
    ...(field.requiredIf && type !== "SECTION" && type !== "CALC" ? { requiredIf: field.requiredIf } : {}),
    ...(field.defaultValue && defaultFits(type, field.defaultValue, field.options) ? { defaultValue: field.defaultValue } : {}),
    ...(field.listed ? { listed: true } : {}),
    ...(field.searchable ? { searchable: true } : {}),
    ...(field.editable ? { editable: true } : {}),
  };
}

// What a type change would throw away, in words (empty = nothing lost).
export function conversionLosses(field: FormField, value: string): string[] {
  if (value === typeValue(field)) return [];
  const next = withType(field, value);
  const lost: string[] = [];
  if ((field.options ?? []).length && !next.options) lost.push(`its ${field.options!.length} option${field.options!.length === 1 ? "" : "s"}`);
  if (field.min !== undefined && next.min === undefined) lost.push("the smallest value");
  if (field.formula && !next.formula) lost.push("the formula");
  if (field.decimals !== undefined && next.decimals === undefined) lost.push("the decimal places");
  if (field.maxFiles !== undefined && next.maxFiles === undefined) lost.push("the file limit");
  if (field.neededBy && !next.neededBy) lost.push('the "needed by" date');
  if (field.confidential && !next.confidential) lost.push("confidential");
  if (field.defaultValue && !next.defaultValue) lost.push("the default value");
  if (field.requiredIf && !next.requiredIf) lost.push('"Required when"');
  if (field.required && !next.required) lost.push("required");
  return lost;
}

// A key not yet on the form: base, base_2, base_3 … (at most 50 characters).
export function uniqueKey(base: string, taken: readonly string[]): string {
  const root = (slugKey(base) || "field").slice(0, 46);
  if (!taken.includes(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const key = `${root}_${n}`;
    if (!taken.includes(key)) return key;
  }
  return `${root}_${Date.now().toString(36)}`.slice(0, 50);
}

// A copy of a field with its own key ("needed by" stays on the original: one per form).
export function duplicateField(field: FormField, taken: readonly string[]): FormField {
  const { neededBy: _neededBy, ...rest } = field;
  void _neededBy;
  const label = field.label ? `${field.label} (copy)`.slice(0, 100) : "";
  return { ...rest, label, key: uniqueKey(field.key || label || "field", taken) };
}

// Fields that use this one (in a rule or a formula), by label.
export function dependentsOf(form: readonly FormField[], key: string): string[] {
  if (!key) return [];
  return form
    .filter((field) => field.key !== key)
    .filter((field) => field.showIf?.field === key || field.requiredIf?.field === key || formulaRefs(field.formula).includes(key))
    .map((field) => field.label || field.key);
}

function formulaRefs(formula: string | undefined): string[] {
  if (!formula?.trim()) return [];
  try {
    return [...formulaFields(parseFormula(formula))];
  } catch {
    return [];
  }
}

// Live check of a formula against the form.
export function formulaProblem(formula: string, form: readonly FormField[], self: string): string | null {
  if (!formula.trim()) return "Write a formula, e.g. quantity * rate.";
  try {
    for (const ref of formulaFields(parseFormula(formula))) {
      const target = form.find((field) => field.key === ref);
      if (!target) return `"${ref}" isn't a field on this form.`;
      if (target.key === self) return "A formula can't use its own field.";
      if (!NUMERIC_TYPES.includes(target.type)) return `"${target.label}" isn't a number.`;
    }
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

// What still needs fixing on a field, shown on its card (the server's check
// on save is the one that counts).
export function fieldProblems(field: FormField, form: readonly FormField[]): string[] {
  const problems: string[] = [];
  if (!field.label.trim()) problems.push("Give it a label.");
  if (!field.key) problems.push("Give it a key.");
  else if (!/^[a-z][a-z0-9_]{0,49}$/.test(field.key)) problems.push("The key starts with a letter and uses a–z, 0–9 and _.");
  else if (form.filter((other) => other.key === field.key).length > 1) problems.push(`Another field uses the key "${field.key}".`);
  if (OPTION_TYPES.includes(field.type) && (field.options ?? []).length < 2) problems.push("Add at least two options.");
  if (field.type === "CALC") {
    const problem = formulaProblem(field.formula ?? "", form, field.key);
    if (problem) problems.push(problem);
  }
  return problems;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
