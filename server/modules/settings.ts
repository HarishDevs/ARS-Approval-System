import { z } from "zod";
import { checkFormDefinition, type FormField } from "@/server/forms/fields";

// v1.9.0 (owner, D-144): Task types and Information types are kept by IT in
// the Admin space. A type's form uses the same field builder as approval
// types; its behaviour is these settings. Both are versioned with the type.
// Pure and unit-tested.
export type ModuleKind = "TASK" | "INFO";
export const MODULE_LABEL: Record<ModuleKind, string> = { TASK: "Task", INFO: "Information" };
export const MODULE_ADMIN_PATH: Record<ModuleKind, string> = { TASK: "/admin/task-types", INFO: "/admin/information-types" };

// Who may create records of a type.
export const accessSchema = z.object({
  mode: z.enum(["EVERYONE", "DEPARTMENTS", "PEOPLE"]),
  departmentIds: z.array(z.number().int().positive()).max(200).default([]),
  userIds: z.array(z.number().int().positive()).max(500).default([]),
});
export type CreateAccess = z.infer<typeof accessSchema>;
export const OPEN_ACCESS: CreateAccess = { mode: "EVERYONE", departmentIds: [], userIds: [] };

// v1.50.1 (owner): Critical, Most Important, Important, Normal (highest first).
// LOW stays valid for older tasks but is no longer offered.
export const ALL_TASK_PRIORITIES = ["LOW", "NORMAL", "IMPORTANT", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof ALL_TASK_PRIORITIES)[number];
export const TASK_PRIORITIES = ["URGENT", "HIGH", "IMPORTANT", "NORMAL"] as const satisfies readonly TaskPriority[];
export const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: "Low", NORMAL: "Normal", IMPORTANT: "Important", HIGH: "Most Important", URGENT: "Critical" };

// Whom a task may be assigned to.
export const ASSIGN_SCOPES = ["ANYONE", "SAME_DEPARTMENT", "MY_TEAM", "GROUPS", "PEOPLE"] as const;
export type AssignScope = (typeof ASSIGN_SCOPES)[number];
export const ASSIGN_SCOPE_LABEL: Record<AssignScope, string> = {
  ANYONE: "Anyone active",
  SAME_DEPARTMENT: "People in the creator's department",
  MY_TEAM: "The creator's team (everyone below them in the reporting line, every level)",
  GROUPS: "Members of chosen groups",
  PEOPLE: "Chosen people",
};

export const COMPLETION_RULES = ["NONE", "NOTE", "FILE", "NOTE_AND_FILE"] as const;
export type CompletionRule = (typeof COMPLETION_RULES)[number];
export const COMPLETION_LABEL: Record<CompletionRule, string> = {
  NONE: "Nothing extra",
  NOTE: "A completion note",
  FILE: "A file as evidence",
  NOTE_AND_FILE: "A note and a file",
};

export const taskSettingsSchema = z.object({
  access: accessSchema,
  assignScope: z.enum(ASSIGN_SCOPES),
  assignGroupIds: z.array(z.number().int().positive()).max(50).default([]),
  assignUserIds: z.array(z.number().int().positive()).max(500).default([]),
  allowBlocked: z.boolean(),
  allowReopen: z.boolean(),
  allowReassign: z.boolean(),
  assigneeMayCancel: z.boolean(),
  completion: z.enum(COMPLETION_RULES),
  defaultPriority: z.enum(ALL_TASK_PRIORITIES),
  requireDueDate: z.boolean(),
  defaultDueDays: z.number().int().min(0).max(365).nullable(),
  reminderHoursBefore: z.number().int().min(1).max(168).nullable(),
  overdueReminder: z.boolean(),
  allowRelatedRequest: z.boolean(),
});
export type TaskSettings = z.infer<typeof taskSettingsSchema>;

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  access: OPEN_ACCESS,
  assignScope: "ANYONE",
  assignGroupIds: [],
  assignUserIds: [],
  allowBlocked: true,
  allowReopen: true,
  allowReassign: true,
  assigneeMayCancel: false,
  completion: "NONE",
  defaultPriority: "NORMAL",
  requireDueDate: false,
  defaultDueDays: null,
  reminderHoursBefore: 24,
  overdueReminder: true,
  allowRelatedRequest: true,
};

export const INFO_PRIORITIES = ["NORMAL", "IMPORTANT", "URGENT"] as const;
export type InfoPriority = (typeof INFO_PRIORITIES)[number];
export const INFO_PRIORITY_LABEL: Record<InfoPriority, string> = { NORMAL: "Normal", IMPORTANT: "Important", URGENT: "Urgent" };
export const ACK_RULES = ["NEVER", "ALWAYS", "SENDER_CHOOSES"] as const;
export type AckRule = (typeof ACK_RULES)[number];
export const ACK_LABEL: Record<AckRule, string> = { NEVER: "Never asked", ALWAYS: "Always asked", SENDER_CHOOSES: "The sender chooses" };

export const infoSettingsSchema = z.object({
  access: accessSchema,
  allowPeople: z.boolean(),
  allowDepartments: z.boolean(),
  allowGroups: z.boolean(),
  allowEveryone: z.boolean(),
  ack: z.enum(ACK_RULES),
  ackReminderDays: z.number().int().min(1).max(60).nullable(),
  defaultPriority: z.enum(INFO_PRIORITIES),
  expiryDays: z.number().int().min(1).max(3650).nullable(),
  editableAfterPublish: z.boolean(),
  // v1.11.0 (D-153): information of this type goes on recipients' calendars
  // (and Google Calendar, if connected) on its effective date. Off unless set.
  calendar: z.boolean().default(false),
});
export type InfoSettings = z.infer<typeof infoSettingsSchema>;

export const DEFAULT_INFO_SETTINGS: InfoSettings = {
  access: OPEN_ACCESS,
  allowPeople: true,
  allowDepartments: true,
  allowGroups: true,
  allowEveryone: false,
  ack: "SENDER_CHOOSES",
  ackReminderDays: 3,
  defaultPriority: "NORMAL",
  expiryDays: null,
  editableAfterPublish: false,
  calendar: false,
};

export function parseTaskSettings(raw: unknown): TaskSettings {
  const parsed = taskSettingsSchema.safeParse(typeof raw === "string" ? safeJson(raw) : raw);
  return parsed.success ? parsed.data : DEFAULT_TASK_SETTINGS;
}

export function parseInfoSettings(raw: unknown): InfoSettings {
  const parsed = infoSettingsSchema.safeParse(typeof raw === "string" ? safeJson(raw) : raw);
  return parsed.success ? parsed.data : DEFAULT_INFO_SETTINGS;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Names the record pages use themselves; a field can't take them.
export const RESERVED_KEYS: Record<ModuleKind, ReadonlySet<string>> = {
  TASK: new Set(["title", "description", "priority", "assignee", "due", "due_at", "starts_on", "related", "submission_key", "type", "attachments", "note"]),
  INFO: new Set(["title", "body", "priority", "recipients", "people", "departments", "groups", "everyone", "ack", "expires_on", "effective_on", "type", "attachments", "intent"]),
};
export const MAX_FIELDS = 30;

// The problems with a type's draft (empty when it can be published).
export function checkTypeDraft(module: ModuleKind, form: readonly FormField[], settings: TaskSettings | InfoSettings): string[] {
  const problems = checkFormDefinition(form);
  if (form.length > MAX_FIELDS) problems.push(`Use at most ${MAX_FIELDS} fields.`);
  for (const field of form) {
    if (RESERVED_KEYS[module].has(field.key)) problems.push(`"${field.label}": the key "${field.key}" is used by the page itself. Choose another.`);
    if (field.type === "LINE_ITEMS") problems.push(`"${field.label}": line items are only for approval forms.`);
  }
  const access = settings.access;
  if (access.mode === "DEPARTMENTS" && access.departmentIds.length === 0) problems.push("Choose at least one department that may create these.");
  if (access.mode === "PEOPLE" && access.userIds.length === 0) problems.push("Choose at least one person who may create these.");
  if (module === "TASK") {
    const task = settings as TaskSettings;
    if (task.assignScope === "GROUPS" && task.assignGroupIds.length === 0) problems.push("Choose at least one group whose members can be assigned.");
    if (task.assignScope === "PEOPLE" && task.assignUserIds.length === 0) problems.push("Choose at least one person who can be assigned.");
  } else {
    const info = settings as InfoSettings;
    if (!info.allowPeople && !info.allowDepartments && !info.allowGroups && !info.allowEveryone) problems.push("Allow at least one way to choose recipients.");
  }
  return problems;
}

// May this person create records of a type with these settings?
export function mayCreate(access: CreateAccess, person: { id: number; departmentId: number | null }): boolean {
  if (access.mode === "EVERYONE") return true;
  if (access.mode === "PEOPLE") return access.userIds.includes(person.id);
  return person.departmentId !== null && access.departmentIds.includes(person.departmentId);
}

// India time (UTC + 5:30) <-> stored UTC, for "due" date-times typed in a form.
const IST_MINUTES = 330;
export function indiaLocalToUtc(local: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match.map(Number) as unknown as number[];
  const utc = Date.UTC(y!, m! - 1, d!, hh!, mm!) - IST_MINUTES * 60_000;
  const date = new Date(utc);
  // Reject impossible dates (31 Feb rolls over).
  const back = new Date(utc + IST_MINUTES * 60_000);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m! - 1 || back.getUTCDate() !== d) return null;
  return date;
}

export function utcToIndiaLocal(date: Date | null): string {
  if (!date) return "";
  return new Date(date.getTime() + IST_MINUTES * 60_000).toISOString().slice(0, 16);
}

export function indiaDateTimeText(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}
