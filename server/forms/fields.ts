import { z } from "zod";
import type { FormData as EngineFormData } from "@/server/engine/types";

// Form fields belong to a workflow version (D-055, S3-01a): a running
// request keeps the fields it was raised with. Pure and unit-tested.
export const FIELD_TYPES = ["TEXT", "LONG_TEXT", "NUMBER", "DATE", "CHOICE", "PERSON"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // CHOICE only
  help?: string;
  min?: number; // NUMBER only: the smallest value allowed (e.g. 0 for amounts, D-QA-04)
}

export const formFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/, "Field keys use lowercase letters, numbers and _ (e.g. amount)."),
  label: z.string().trim().min(1, "Every field needs a label.").max(100),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  help: z.string().trim().max(200).optional(),
  min: z.number().finite().optional(),
});

export const formSchema = z.array(formFieldSchema).max(40);

// Admin side: is this form definition usable?
export function checkFormDefinition(fields: readonly FormField[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const field of fields) {
    if (keys.has(field.key)) problems.push(`Two fields use the key "${field.key}".`);
    keys.add(field.key);
    if (field.type === "CHOICE" && (!field.options || field.options.length < 2)) problems.push(`"${field.label}" needs at least two choices.`);
    if (field.type !== "CHOICE" && field.options?.length) problems.push(`"${field.label}" has choices but isn't a choice field.`);
    if (field.type !== "NUMBER" && field.min !== undefined) problems.push(`"${field.label}" has a minimum but isn't a number field.`);
  }
  return problems;
}

export type FormParseResult = { ok: true; data: EngineFormData } | { ok: false; errors: Record<string, string> };

// Requester side: turn submitted strings into typed values. Numbers accept
// Indian grouping (12,50,000); dates are YYYY-MM-DD; a person must be an
// active user.
export function parseFormSubmission(fields: readonly FormField[], raw: Record<string, string | undefined>, activeUserIds: ReadonlySet<number>): FormParseResult {
  const data: EngineFormData = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = (raw[field.key] ?? "").trim();
    if (value === "") {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      continue;
    }
    switch (field.type) {
      case "TEXT":
        if (value.length > 200) errors[field.key] = "Use 200 characters or fewer.";
        else data[field.key] = value;
        break;
      case "LONG_TEXT":
        if (value.length > 4000) errors[field.key] = "Use 4000 characters or fewer.";
        else data[field.key] = value;
        break;
      case "NUMBER": {
        const cleaned = value.replace(/[,\s₹]/g, "");
        const number = Number(cleaned);
        if (cleaned === "" || !Number.isFinite(number)) errors[field.key] = "Enter a number.";
        else if (Math.abs(number) > 1e13) errors[field.key] = "That number is too large.";
        else if (field.min !== undefined && number < field.min) errors[field.key] = `Enter ${field.min.toLocaleString("en-IN")} or more.`;
        else data[field.key] = number;
        break;
      }
      case "DATE": {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        const date = match ? new Date(`${value}T00:00:00Z`) : null;
        if (!match || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) errors[field.key] = "Enter a date as YYYY-MM-DD.";
        else data[field.key] = value;
        break;
      }
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
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

// For showing stored values back on the request page.
export function displayValue(field: FormField, value: unknown, names: ReadonlyMap<number, string>): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "NUMBER" && typeof value === "number") return value.toLocaleString("en-IN");
  if (field.type === "PERSON" && typeof value === "number") return names.get(value) ?? `User #${value}`;
  return String(value);
}
