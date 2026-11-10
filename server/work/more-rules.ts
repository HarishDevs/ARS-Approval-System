import { z } from "zod";

// D-218: pure rules for recurring tasks, project custom fields, project
// templates and the daily digest (unit-tested).

// ---- recurring tasks -------------------------------------------------------------------
export const RECURRENCE_KINDS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "AFTER_DONE"] as const;
export const recurrenceSchema = z.object({
  kind: z.enum(RECURRENCE_KINDS),
  every: z.number().int().min(1).max(365),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]), // 0 = Sunday (WEEKLY)
  // QA-WF-04 (v1.42.1), kept by the series itself: the day of the month it's
  // meant for (31 stays 31 after a short month) and the current occurrence's
  // planned day before any holiday move, so neither drifts.
  anchorDay: z.number().int().min(1).max(31).optional(),
  planned: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

export function parseRecurrence(raw: unknown): Recurrence | null {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const parsed = recurrenceSchema.safeParse(value);
  if (!parsed.success) return null;
  const rule = parsed.data;
  return rule.kind === "WEEKLY" ? { ...rule, weekdays: [...new Set(rule.weekdays)].sort() } : { ...rule, weekdays: [] };
}

// The next planned day of a series and what the rule remembers for the one after (QA-WF-04).
export function nextOccurrence(rule: Recurrence, dueDay: string | null, doneDay: string): { planned: string; rule: Recurrence } {
  const base = rule.planned ?? dueDay;
  const anchorDay = rule.anchorDay ?? (base ? Number(base.slice(8, 10)) : undefined);
  const planned = nextDueDay(rule, base, doneDay, anchorDay);
  return { planned, rule: { ...rule, planned, ...(anchorDay ? { anchorDay } : {}) } };
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function recurrenceLabel(rule: Recurrence): string {
  const n = rule.every;
  switch (rule.kind) {
    case "DAILY":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "WEEKLY": {
      const days = rule.weekdays.length ? ` on ${rule.weekdays.map((day) => WEEKDAY_NAMES[day]).join(", ")}` : "";
      return `${n === 1 ? "Every week" : `Every ${n} weeks`}${days}`;
    }
    case "MONTHLY":
      return n === 1 ? "Every month" : `Every ${n} months`;
    case "YEARLY":
      return n === 1 ? "Every year" : `Every ${n} years`;
    case "AFTER_DONE":
      return `${n} day${n === 1 ? "" : "s"} after it is completed`;
  }
}

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);
export function shiftDays(day: string, days: number): string {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}
function addMonths(day: string, months: number, anchorDay?: number): string {
  const date = toDate(day);
  const wanted = anchorDay ?? date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(wanted, last)); // 31 Jan + 1 month = 28/29 Feb
  return toDay(target);
}

// The next due day. `dueDay` is the completed task's due day (or null), and
// `doneDay` the day it was completed; both are India dates.
export function nextDueDay(rule: Recurrence, dueDay: string | null, doneDay: string, anchorDay?: number): string {
  const base = dueDay ?? doneDay;
  switch (rule.kind) {
    case "DAILY":
      return shiftDays(base, rule.every);
    case "MONTHLY":
      return addMonths(base, rule.every, anchorDay);
    case "YEARLY":
      return addMonths(base, rule.every * 12, anchorDay);
    case "AFTER_DONE":
      return shiftDays(doneDay, rule.every);
    case "WEEKLY": {
      if (!rule.weekdays.length) return shiftDays(base, 7 * rule.every);
      // The next chosen weekday after the base, in a week that is a whole
      // number of `every` weeks from the base's week (weeks start Monday).
      const weekStart = (day: string) => shiftDays(day, -((toDate(day).getUTCDay() + 6) % 7));
      const baseWeek = weekStart(base);
      for (let offset = 1; offset <= 7 * rule.every + 7; offset += 1) {
        const candidate = shiftDays(base, offset);
        const weeks = daysBetween(baseWeek, weekStart(candidate)) / 7;
        if (rule.weekdays.includes(toDate(candidate).getUTCDay()) && weeks % rule.every === 0) return candidate;
      }
      return shiftDays(base, 7 * rule.every);
    }
  }
}

// ---- custom fields -------------------------------------------------------------------
export const FIELD_KINDS = ["TEXT", "NUMBER", "SELECT", "DATE"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const FIELD_KIND_LABEL: Record<FieldKind, string> = { TEXT: "Text", NUMBER: "Number", SELECT: "Choice", DATE: "Date" };
export const MAX_FIELDS_PER_PROJECT = 20;
export const MAX_FIELD_OPTIONS = 30;

export function cleanFieldOptions(kind: FieldKind, raw: string): string[] {
  if (kind !== "SELECT") return [];
  return [...new Set(raw.split(/[\n,]/).map((item) => item.replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean))].slice(0, MAX_FIELD_OPTIONS);
}

// A value for a field: "" clears it.
export function checkFieldValue(kind: FieldKind, options: readonly string[], raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  switch (kind) {
    case "TEXT":
      return value.length <= 500 ? { ok: true, value } : { ok: false, message: "Use 500 characters or fewer." };
    case "NUMBER": {
      // D-234 (Postel): "₹ 1,200" and "1 200" are read like the request forms read them.
      const number = Number(value.replace(/[,\s₹]/g, ""));
      return Number.isFinite(number) && Math.abs(number) < 1e15 ? { ok: true, value: String(number) } : { ok: false, message: "Enter a number." };
    }
    case "SELECT":
      return options.includes(value) ? { ok: true, value } : { ok: false, message: "Choose one of the options." };
    case "DATE":
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toDate(value).getTime()) ? { ok: true, value } : { ok: false, message: "Choose a date." };
  }
}

// ---- project templates --------------------------------------------------------------
const templateTask: z.ZodType<TemplateTask> = z.lazy(() =>
  z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).nullable(),
    priority: z.enum(["LOW", "NORMAL", "IMPORTANT", "HIGH", "URGENT"]),
    section: z.number().int().min(0).max(99),
    dueOffset: z.number().int().min(-3650).max(3650).nullable(), // days from the project's start
    startOffset: z.number().int().min(-3650).max(3650).nullable(),
    isMilestone: z.boolean(),
    tags: z.array(z.string().max(60)).max(20),
    fields: z.record(z.string(), z.string().max(500)),
    subtasks: z.array(templateTask).max(100),
  }),
);
export interface TemplateTask {
  title: string;
  description: string | null;
  priority: "LOW" | "NORMAL" | "IMPORTANT" | "HIGH" | "URGENT";
  section: number; // index into sections
  dueOffset: number | null;
  startOffset: number | null;
  isMilestone: boolean;
  tags: string[];
  fields: Record<string, string>; // field name → value
  subtasks: TemplateTask[];
}
export const templateSchema = z.object({
  sections: z.array(z.string().min(1).max(150)).min(1).max(100),
  fields: z.array(z.object({ name: z.string().min(1).max(60), kind: z.enum(FIELD_KINDS), options: z.array(z.string().max(60)).max(MAX_FIELD_OPTIONS) })).max(MAX_FIELDS_PER_PROJECT),
  tasks: z.array(templateTask).max(1000),
});
export type ProjectTemplate = z.infer<typeof templateSchema>;
export function parseTemplate(raw: unknown): ProjectTemplate | null {
  const parsed = templateSchema.safeParse(typeof raw === "string" ? safeJson(raw) : raw);
  return parsed.success ? parsed.data : null;
}
export function countTemplateTasks(tasks: readonly TemplateTask[]): number {
  return tasks.reduce((total, task) => total + 1 + countTemplateTasks(task.subtasks), 0);
}

// ---- daily digest --------------------------------------------------------------------
export const digestSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  hour: z.number().int().min(5).max(12).default(9), // India time
  workingDaysOnly: z.boolean().default(true),
});
export type DigestSettings = z.infer<typeof digestSettingsSchema>;
export const DEFAULT_DIGEST: DigestSettings = digestSettingsSchema.parse({});
export const DIGEST_SETTINGS_KEY = "tasks.digest";
export function parseDigestSettings(raw: string | null | undefined): DigestSettings {
  const parsed = digestSettingsSchema.safeParse(raw ? safeJson(raw) : {});
  return parsed.success ? parsed.data : DEFAULT_DIGEST;
}
export const RECURRENCE_SETTINGS_KEY = "tasks.recurrence";
export const recurrenceSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  skipHolidays: z.boolean().default(true), // the next date moves off holidays (Task holidays' rules)
});
export type RecurrenceSettings = z.infer<typeof recurrenceSettingsSchema>;
export function parseRecurrenceSettings(raw: string | null | undefined): RecurrenceSettings {
  const parsed = recurrenceSettingsSchema.safeParse(raw ? safeJson(raw) : {});
  return parsed.success ? parsed.data : recurrenceSettingsSchema.parse({});
}

export interface DigestItem {
  taskNo: string;
  title: string;
  dueDay: string | null;
}
// The digest text, or null when there is nothing to say.
export function digestText(input: { name: string; overdue: DigestItem[]; today: DigestItem[]; assigned: DigestItem[] }): { title: string; text: string } | null {
  const total = input.overdue.length + input.today.length + input.assigned.length;
  if (!total) return null;
  const block = (heading: string, items: DigestItem[]) =>
    items.length ? [`${heading} (${items.length}):`, ...items.slice(0, 15).map((item) => `- ${item.taskNo} ${item.title}${item.dueDay ? ` (due ${item.dueDay})` : ""}`), ...(items.length > 15 ? [`- and ${items.length - 15} more`] : [])].join("\n") : "";
  const text = [`Good morning ${input.name}, here are your tasks for today.`, block("Overdue", input.overdue), block("Due today", input.today), block("New for you since yesterday", input.assigned)].filter(Boolean).join("\n\n");
  const parts = [input.overdue.length && `${input.overdue.length} overdue`, input.today.length && `${input.today.length} due today`, input.assigned.length && `${input.assigned.length} new`].filter(Boolean);
  return { title: `Your tasks today: ${parts.join(", ")}`, text };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
