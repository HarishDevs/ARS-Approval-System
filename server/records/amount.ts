import { formatPaise } from "@/server/forms/dynamic";
import { isConfidential, type FormField } from "@/server/forms/fields";
import { parseTypeSettings } from "@/server/workflows/type-settings";

// PB-34 (owner, 2 Nov 2026): the request's amount in Admin → Records. The
// amount field is chosen as on the mobile card (v1.43.0): the type's budget
// amount field when budget checks are on, otherwise its first currency or
// line-items field. If that field is confidential (A8), only a viewer who
// may see confidential values (QA-SEC-01) sees the figure; others see "Hidden".
export const HIDDEN_AMOUNT = "Hidden";

export interface RecordAmount {
  value: number | null; // rupees
  confidential: boolean;
}

function json<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function requestAmount(formJson: unknown, dataJson: unknown, settingsJson: unknown): RecordAmount {
  const form = json<FormField[]>(formJson) ?? [];
  const data = json<Record<string, unknown>>(dataJson) ?? {};
  const settings = parseTypeSettings(settingsJson);
  const money = Array.isArray(form) ? form.filter((field) => field.type === "CURRENCY" || field.type === "LINE_ITEMS") : [];
  const field = (settings.budget.enabled ? money.find((item) => item.key === settings.budget.amountField) : undefined) ?? money[0];
  if (!field) return { value: null, confidential: false };
  const value = data[field.key];
  return { value: typeof value === "number" && Number.isFinite(value) ? value : null, confidential: isConfidential(field) };
}

export function amountText(amount: RecordAmount, seeConfidential: boolean): string {
  // Hidden even when empty, so "no amount" isn't given away either.
  if (amount.confidential && !seeConfidential) return HIDDEN_AMOUNT;
  if (amount.value === null) return "";
  return formatPaise(Math.round(amount.value * 100));
}
