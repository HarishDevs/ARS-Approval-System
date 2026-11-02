import { z } from "zod";
import type { FormData as EngineFormData } from "@/server/engine/types";
import { conditionSpecSchema, operatorNeedsValue, ruleComparisons, upgradeRule } from "@/server/conditions/rule";
import { cleanOptionColors, type OptionColor } from "@/server/forms/option-colors";
import { computeLines, dependencyOrder, evaluateFormula, formatPaise, formulaFields, paiseToRupees, parseFormula, roundTo, ruleHolds, visibleFields, type FieldRule, type Line, type LineInput } from "@/server/forms/dynamic";

// Form fields belong to a workflow version (D-055, S3-01a): a running
// request keeps the fields it was raised with. Pure and unit-tested.
// v1.6.0: CALC (worked out by a formula), LINE_ITEMS (quantity × rate +
// GST, total in the field's own key), SECTION (a heading; holds no value).
// v1.6.1: ATTACHMENT (files uploaded to this field; its value is the file count).
// v1.9.0: CURRENCY (₹, two decimals), DATETIME (India time), MULTI_CHOICE
// (several of the options), CHECKBOX (ticked = "Yes"), RADIO (one option,
// shown as buttons), URL (http/https link).
export const FIELD_TYPES = ["TEXT", "LONG_TEXT", "NUMBER", "DATE", "CHOICE", "PERSON", "LOOKUP", "CALC", "LINE_ITEMS", "SECTION", "ATTACHMENT", "CURRENCY", "DATETIME", "MULTI_CHOICE", "CHECKBOX", "RADIO", "URL"] as const;
// Most files one attachment field takes (the request limit of 20 still applies).
export const MAX_FIELD_FILES = 5;
// Types whose value is a number (usable in formulas, rules and the DoA).
export const NUMERIC_TYPES: readonly string[] = ["NUMBER", "CALC", "LINE_ITEMS", "CURRENCY"];
// Types whose values come from the field's own list of options.
export const OPTION_TYPES: readonly string[] = ["CHOICE", "RADIO", "MULTI_CHOICE"];
export type FieldType = (typeof FIELD_TYPES)[number];

// LOOKUP fields take their options from the database (S12-06, D-088): the
// requester picks from the live, active list; the code is stored.
export const LOOKUP_SOURCES = ["DEPARTMENT", "DESIGNATION"] as const;
export type LookupSource = (typeof LOOKUP_SOURCES)[number];
export type LookupOption = { code: string; name: string };
export type FieldLookups = Record<LookupSource, LookupOption[]>;
export const NO_LOOKUPS: FieldLookups = { DEPARTMENT: [], DESIGNATION: [] };
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const DATETIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
export const isDateTime = (value: unknown): value is string => typeof value === "string" && DATETIME.test(value) && isIsoDate(value.slice(0, 10));

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // CHOICE only
  optionColors?: Record<string, OptionColor>; // v1.47.0: option → pill colour (choice types only)
  source?: LookupSource; // LOOKUP only
  help?: string;
  min?: number; // NUMBER only: the smallest value allowed (e.g. 0 for amounts, D-QA-04)
  // v1.6.0 smart forms
  showIf?: FieldRule; // shown only when this holds (otherwise cleared)
  requiredIf?: FieldRule; // required only when this holds
  formula?: string; // CALC only, e.g. "quantity * rate * (1 + gst / 100)"
  decimals?: number; // CALC only: 0–4 (default 2)
  defaultValue?: string; // filled in on a new request
  neededBy?: boolean; // DATE only: the request's "needed by" date (calendar)
  maxFiles?: number; // ATTACHMENT only: 1–5 (default 5)
  confidential?: boolean; // v1.7.0 (A8): only the requester, approvers and IT see the value
  // v1.9.0 (task and information forms): shown as a column in lists,
  // matched by the list search, may be changed after the record is made.
  listed?: boolean;
  searchable?: boolean;
  editable?: boolean;
}

// A8: what everyone else sees in place of a confidential value.
export const CONFIDENTIAL_TEXT = "Confidential";
export const isConfidential = (field: Pick<FormField, "confidential" | "type">) => Boolean(field.confidential) && field.type !== "SECTION";

// 2 Nov 2026: a field rule is the one condition shape (server/conditions/rule.ts).
// An older { field, op, value } rule read from the database is converted
// first, so a database the migration hasn't reached yet still loads.
const ruleSchema = z.preprocess((rule) => upgradeRule(rule), conditionSpecSchema);

export const formFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/, "Field keys use lowercase letters, numbers and _ (e.g. amount)."),
  label: z.string().trim().min(1, "Every field needs a label.").max(100),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  source: z.enum(LOOKUP_SOURCES).optional(),
  help: z.string().trim().max(200).optional(),
  min: z.number().finite().optional(),
  showIf: ruleSchema.optional(),
  requiredIf: ruleSchema.optional(),
  formula: z.string().trim().max(500).optional(),
  decimals: z.number().int().min(0).max(4).optional(),
  defaultValue: z.string().trim().max(200).optional(),
  neededBy: z.boolean().optional(),
  maxFiles: z.number().int().min(1).max(MAX_FIELD_FILES).optional(),
  confidential: z.boolean().optional(),
  listed: z.boolean().optional(),
  searchable: z.boolean().optional(),
  editable: z.boolean().optional(),
  optionColors: z.record(z.string(), z.unknown()).optional(),
}).transform(({ optionColors, ...field }) => {
  // v1.47.0: colours only for a choice field's own options, only palette
  // colours; anything else is dropped (never refused, so older data loads).
  const colors = OPTION_TYPES.includes(field.type) ? cleanOptionColors(field.options, optionColors) : undefined;
  return { ...field, ...(colors ? { optionColors: colors } : {}) };
});

export const formSchema = z.array(formFieldSchema).max(40);

// Admin side: is this form definition usable?
export function checkFormDefinition(fields: readonly FormField[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const field of fields) {
    if (keys.has(field.key)) problems.push(`Two fields use the key "${field.key}".`);
    keys.add(field.key);
    const hasOptions = OPTION_TYPES.includes(field.type);
    if (hasOptions && (!field.options || field.options.length < 2)) problems.push(`"${field.label}" needs at least two choices.`);
    if (!hasOptions && field.options?.length) problems.push(`"${field.label}" has choices but isn't a choice field.`);
    if (hasOptions && field.options && new Set(field.options.map((option) => option.toLowerCase())).size !== field.options.length) problems.push(`"${field.label}" has the same choice twice.`);
    if (field.type !== "NUMBER" && field.type !== "CURRENCY" && field.min !== undefined) problems.push(`"${field.label}" has a minimum but isn't a number field.`);
    if (hasOptions && field.defaultValue && !(field.options ?? []).includes(field.defaultValue)) problems.push(`"${field.label}": the default must be one of the choices.`);
    if (field.type === "URL" && field.defaultValue && !isWebLink(field.defaultValue)) problems.push(`"${field.label}": the default must be a web link (https://…).`);
    if (field.type === "LOOKUP" && !field.source) problems.push(`"${field.label}" needs a list to choose from (departments or designations).`);
    if (field.type !== "LOOKUP" && field.source) problems.push(`"${field.label}" has a list but isn't a list field.`);
    if (!field.label.trim()) problems.push("Every field needs a label.");
    // v1.6.0 smart forms
    if (field.type === "CALC") {
      if (!field.formula) problems.push(`"${field.label}" needs a formula.`);
      else {
        try {
          const refs = formulaFields(parseFormula(field.formula));
          for (const ref of refs) {
            const target = fields.find((other) => other.key === ref);
            if (!target) problems.push(`"${field.label}": the formula uses "${ref}", which isn't a field on this form.`);
            else if (!NUMERIC_TYPES.includes(target.type)) problems.push(`"${field.label}": "${target.label}" isn't a number, so it can't be used in a formula.`);
          }
        } catch (error) {
          problems.push(`"${field.label}": ${(error as Error).message}`);
        }
      }
      if (field.required) problems.push(`"${field.label}" is worked out, so it can't be marked required.`);
    } else if (field.formula) problems.push(`"${field.label}" has a formula but isn't a calculated field.`);
    if (field.type === "SECTION" && (field.required || field.requiredIf)) problems.push(`"${field.label}" is a heading; it can't be required.`);
    if (field.neededBy && field.type !== "DATE") problems.push(`"${field.label}": only a date can be the "needed by" date.`);
    if (field.confidential && field.type === "SECTION") problems.push(`"${field.label}" is a heading; it can't be confidential.`);
    if (field.maxFiles !== undefined && field.type !== "ATTACHMENT") problems.push(`"${field.label}" has a file limit but isn't an attachment field.`);
    if (field.type === "ATTACHMENT" && field.defaultValue) problems.push(`"${field.label}" is an attachment field; it can't have a default value.`);
    for (const [name, rule] of [["show", field.showIf], ["require", field.requiredIf]] as const) {
      if (!rule) continue;
      // 2 Nov 2026: one rule shape (server/conditions/rule.ts); each of its
      // conditions is checked. An older saved rule is read as converted.
      for (const condition of ruleComparisons(upgradeRule(rule))) {
        const target = fields.find((other) => other.key === condition.field);
        const problem = !target
          ? `the ${name} rule uses "${condition.field}", which isn't a field on this form.`
          : target.key === field.key
            ? "a rule can't depend on the field itself."
            : target.type === "SECTION"
              ? "a rule can't use a heading."
              : ["GT", "GTE", "LT", "LTE"].includes(condition.operator) && !NUMERIC_TYPES.includes(target.type) && target.type !== "DATE"
                ? '"more/less than" needs a number or date field.'
                : target.type === "ATTACHMENT" && operatorNeedsValue(condition.operator)
                  ? "a rule on an attachment field can only check whether files were added."
                  : operatorNeedsValue(condition.operator) && (condition.value === undefined || condition.value === "" || (Array.isArray(condition.value) && condition.value.length === 0))
                    ? `the ${name} rule needs a value.`
                    : null;
        if (problem) {
          problems.push(`"${field.label}": ${problem}`);
          break;
        }
      }
    }
  }
  if (problems.length === 0 && dependencyOrder(fields) === null) problems.push("Some fields depend on each other in a circle (their rules or formulas). Remove one of the links.");
  if (fields.filter((field) => field.neededBy).length > 1) problems.push('Only one date can be the "needed by" date.');
  return problems;
}

// On failure `data` still holds the fields that were fine (test mode uses them).
export type FormParseResult = { ok: true; data: EngineFormData } | { ok: false; errors: Record<string, string>; data: EngineFormData };

// Requester side: turn submitted strings into typed values. Numbers accept
// Indian grouping (12,50,000); dates are YYYY-MM-DD; a person must be an
// active user.
export function parseFormSubmission(
  fields: readonly FormField[],
  raw: Record<string, string | undefined>,
  activeUserIds: ReadonlySet<number>,
  lookups: FieldLookups = NO_LOOKUPS,
): FormParseResult {
  const data: EngineFormData = {};
  const errors: Record<string, string> = {};
  // 1. Typed values for every field the person can type in.
  for (const field of fields) {
    if (field.type === "SECTION" || field.type === "CALC") continue;
    const value = (raw[field.key] ?? "").trim();
    if (value === "") continue;
    switch (field.type) {
      case "TEXT":
        if (value.length > 200) errors[field.key] = "Use 200 characters or fewer.";
        else data[field.key] = value;
        break;
      case "LONG_TEXT":
        if (value.length > 4000) errors[field.key] = "Use 4000 characters or fewer.";
        else data[field.key] = value;
        break;
      case "CURRENCY":
      case "NUMBER": {
        const cleaned = value.replace(/[,\s₹]/g, "");
        const number = Number(cleaned);
        if (cleaned === "" || !Number.isFinite(number)) errors[field.key] = "Enter a number.";
        else if (Math.abs(number) > 1e13) errors[field.key] = "That number is too large.";
        else if (field.min !== undefined && number < field.min) errors[field.key] = `Enter ${field.min.toLocaleString("en-IN")} or more.`;
        else if (field.type === "CURRENCY" && !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) errors[field.key] = "Use at most two decimal places (paise).";
        else data[field.key] = number;
        break;
      }
      case "DATETIME":
        if (!isDateTime(value)) errors[field.key] = "Choose a valid date and time.";
        else data[field.key] = value;
        break;
      case "URL":
        if (value.length > 500) errors[field.key] = "Use a link of 500 characters or fewer.";
        else if (!isWebLink(value)) errors[field.key] = "Enter a web link starting with https:// or http://.";
        else data[field.key] = value;
        break;
      case "CHECKBOX":
        if (!["yes", "on", "true"].includes(value.toLowerCase())) errors[field.key] = "Tick the box or leave it empty.";
        else data[field.key] = "Yes";
        break;
      case "MULTI_CHOICE": {
        // The browser sends the ticked options as a JSON list.
        let picked: unknown;
        try {
          picked = JSON.parse(value);
        } catch {
          picked = null;
        }
        if (!Array.isArray(picked) || picked.some((item) => typeof item !== "string" || !field.options?.includes(item))) errors[field.key] = "Choose from the options.";
        else if (picked.length) data[field.key] = (field.options ?? []).filter((option) => (picked as string[]).includes(option));
        break;
      }
      case "DATE":
        if (!isIsoDate(value)) errors[field.key] = "Choose a valid date.";
        else data[field.key] = value;
        break;
      case "LOOKUP": {
        const option = field.source ? lookups[field.source].find((item) => item.code === value) : undefined;
        if (!option) errors[field.key] = "Choose one of the options.";
        else data[field.key] = option.code;
        break;
      }
      case "RADIO":
      case "CHOICE":
        if (!field.options?.includes(value)) errors[field.key] = "Choose one of the options.";
        else data[field.key] = value;
        break;
      case "PERSON": {
        const id = /^\d+$/.test(value) ? Number(value) : NaN;
        if (!activeUserIds.has(id)) errors[field.key] = "Choose an active person.";
        else data[field.key] = id;
        break;
      }
      case "ATTACHMENT": {
        // The server puts the number of files it received here; anything
        // the browser sends for this key is overwritten (actions.ts).
        const count = /^\d{1,3}$/.test(value) ? Number(value) : NaN;
        if (!Number.isFinite(count)) errors[field.key] = "The files couldn't be read. Choose them again.";
        else if (count > (field.maxFiles ?? MAX_FIELD_FILES)) errors[field.key] = `Add at most ${field.maxFiles ?? MAX_FIELD_FILES} file${(field.maxFiles ?? MAX_FIELD_FILES) === 1 ? "" : "s"} here.`;
        else if (count > 0) data[field.key] = count;
        break;
      }
      case "LINE_ITEMS": {
        // The browser sends the rows as JSON; totals are worked out here.
        let inputs: LineInput[] = [];
        try {
          const parsed = JSON.parse(value) as unknown;
          if (!Array.isArray(parsed)) throw new Error("not a list");
          inputs = parsed
            .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
            .map((row) => ({ description: String(row.description ?? ""), quantity: String(row.quantity ?? ""), rate: String(row.rate ?? ""), gst: row.gst === undefined ? undefined : String(row.gst) }))
            .filter((row) => row.description.trim() || row.quantity.trim() || row.rate.trim());
        } catch {
          errors[field.key] = "The lines couldn't be read. Check them and try again.";
          break;
        }
        if (inputs.length === 0) break;
        const result = computeLines(inputs);
        if (!result.ok) errors[field.key] = result.message;
        else {
          data[field.key] = paiseToRupees(result.totalPaise);
          data[linesKey(field.key)] = JSON.stringify(result.lines);
        }
        break;
      }
    }
  }
  // 2. Calculated fields, in dependency order, from the typed values only.
  const order = dependencyOrder(fields) ?? fields.map((field) => field.key);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  for (const key of order) {
    const field = byKey.get(key);
    if (!field || field.type !== "CALC" || !field.formula) continue;
    try {
      const value = evaluateFormula(parseFormula(field.formula), data as Record<string, string | number | null>);
      if (value !== null && Number.isFinite(value)) data[field.key] = roundTo(value, field.decimals ?? 2);
    } catch {
      // the form check refuses bad formulas; nothing to add here
    }
  }
  // 3. Hidden fields are cleared (and their problems don't count); then
  //    "required" and "required when" are checked on what is shown.
  const shown = visibleFields(fields, data as Record<string, string | number | null>);
  for (const field of fields) {
    if (!shown.has(field.key)) {
      delete data[field.key];
      delete data[linesKey(field.key)];
      delete errors[field.key];
      continue;
    }
    if (field.type === "SECTION" || field.type === "CALC") continue;
    const required = field.required || (field.requiredIf ? ruleHolds(field.requiredIf, data as Record<string, string | number | null>) : false);
    if (required && field.type === "CHECKBOX" && data[field.key] === undefined && !errors[field.key]) {
      errors[field.key] = `Tick "${field.label}" to continue.`;
      continue;
    }
    if (required && (data[field.key] === undefined || data[field.key] === "") && !errors[field.key]) {
      errors[field.key] = field.type === "LINE_ITEMS" ? `Add at least one line to ${field.label}.` : field.type === "ATTACHMENT" ? `Attach at least one file to ${field.label}.` : `${field.label} is required.`;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors, data } : { ok: true, data };
}

// A web link people can open: http or https only (never javascript: etc.).
export function isWebLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

// Where a line-items field keeps its rows (the total is under its own key).
export const linesKey = (key: string) => `${key}__lines`;

export function storedLines(formData: Record<string, unknown>, key: string): Line[] {
  const raw = formData[linesKey(key)];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as Line[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// For showing stored values back on the request page.
export function displayValue(field: FormField, value: unknown, names: ReadonlyMap<number, string>, lookupNames?: ReadonlyMap<string, string>): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  if (field.type === "CURRENCY" && typeof value === "number") return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (field.type === "DATETIME" && isDateTime(value)) {
    const [day, time] = value.split("T");
    return `${new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}, ${time}`;
  }
  if (field.type === "DATE" && isIsoDate(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }
  if (field.type === "LOOKUP" && field.source && typeof value === "string") return lookupNames?.get(`${field.source}:${value}`) ?? value;
  if (field.type === "NUMBER" && typeof value === "number") return value.toLocaleString("en-IN");
  if (field.type === "CALC" && typeof value === "number") return value.toLocaleString("en-IN", { maximumFractionDigits: field.decimals ?? 2 });
  if (field.type === "LINE_ITEMS" && typeof value === "number") return `${formatPaise(Math.round(value * 100))}`;
  if (field.type === "ATTACHMENT" && typeof value === "number") return `${value} file${value === 1 ? "" : "s"}`;
  if (field.type === "PERSON" && typeof value === "number") return names.get(value) ?? `User #${value}`;
  return String(value);
}
