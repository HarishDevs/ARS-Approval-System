import { z } from "zod";

// D-209 (owner): reminders and escalations for approvals and tasks that IT
// builds in Admin, on any field and value. A rule has conditions (all or any
// must match) and one or more stages. Each stage fires a number of hours
// after an anchor (when the step or task started, when it was raised, or its
// due time; negative = before the due time), may repeat, and goes to chosen
// recipients. Several stages make escalation levels. Pure and unit-tested;
// the job runner (rule-runner.ts) reads the records and sends.

export const RULE_KINDS = ["REMINDER", "ESCALATION"] as const;
export const RULE_MODULES = ["APPROVAL", "TASK"] as const;
export const ANCHORS = ["STARTED", "RAISED", "DUE"] as const;
export const OPERATORS = ["EQ", "NE", "GT", "GE", "LT", "LE", "CONTAINS", "IN", "EMPTY", "NOT_EMPTY"] as const;
export const RECIPIENTS = ["ASSIGNEE", "DELEGATE", "ASSIGNEE_MANAGER", "ASSIGNEE_MANAGER_2", "REQUESTER", "REQUESTER_MANAGER", "HOD", "IT_ADMINS"] as const;

export type RuleKind = (typeof RULE_KINDS)[number];
export type RuleModule = (typeof RULE_MODULES)[number];
export type Anchor = (typeof ANCHORS)[number];
export type Operator = (typeof OPERATORS)[number];
export type RecipientKind = (typeof RECIPIENTS)[number];

export const KIND_LABEL: Record<RuleKind, string> = { REMINDER: "Reminder", ESCALATION: "Escalation" };
export const MODULE_LABEL: Record<RuleModule, string> = { APPROVAL: "Approvals (pending steps)", TASK: "Tasks (open tasks)" };
export const ANCHOR_LABEL: Record<Anchor, string> = { STARTED: "it reached the person", RAISED: "it was raised", DUE: "its due time" };
export const OPERATOR_LABEL: Record<Operator, string> = {
  EQ: "is",
  NE: "is not",
  GT: "is more than",
  GE: "is at least",
  LT: "is less than",
  LE: "is at most",
  CONTAINS: "contains",
  IN: "is one of",
  EMPTY: "is empty",
  NOT_EMPTY: "is not empty",
};
export const RECIPIENT_LABEL: Record<RecipientKind, string> = {
  ASSIGNEE: "The approver / assignee",
  DELEGATE: "Their active delegate",
  ASSIGNEE_MANAGER: "Their manager",
  ASSIGNEE_MANAGER_2: "Their manager's manager",
  REQUESTER: "The requester / task creator",
  REQUESTER_MANAGER: "The requester's manager",
  HOD: "Head of department",
  IT_ADMINS: "IT admins",
};

const conditionSchema = z.object({
  field: z.string().trim().min(1, "Choose a field.").max(120),
  op: z.enum(OPERATORS),
  value: z.string().max(500).default(""),
});
export type Condition = z.infer<typeof conditionSchema>;

const stageSchema = z.object({
  anchor: z.enum(ANCHORS),
  offsetHours: z.number().min(-720, "Use -720 hours or more.").max(4320, "Use 4,320 hours (180 days) or less."),
  repeatHours: z.number().min(1, "Repeat every 1 hour or more.").max(720).nullable().default(null),
  maxTimes: z.number().int().min(1).max(20).default(1),
  recipients: z.array(z.enum(RECIPIENTS)).max(RECIPIENTS.length).default([]),
  userIds: z.array(z.number().int().positive()).max(50).default([]),
});
export type Stage = z.infer<typeof stageSchema>;

export const ruleSchema = z
  .object({
    name: z.string().trim().min(3, "Give the rule a name of 3 or more characters.").max(150),
    kind: z.enum(RULE_KINDS),
    module: z.enum(RULE_MODULES),
    active: z.boolean().default(true),
    match: z.enum(["ALL", "ANY"]).default("ALL"),
    conditions: z.array(conditionSchema).max(20, "Use at most 20 conditions.").default([]),
    stages: z.array(stageSchema).min(1, "Add at least one stage.").max(10, "Use at most 10 stages."),
    email: z.boolean().default(true),
    subject: z.string().trim().max(200).default(""),
    body: z.string().trim().max(4000).default(""),
  })
  .superRefine((rule, ctx) => {
    rule.stages.forEach((stage, index) => {
      if (!stage.recipients.length && !stage.userIds.length) ctx.addIssue({ code: "custom", path: ["stages", index], message: `Stage ${index + 1}: choose who gets it.` });
      if (stage.offsetHours < 0 && stage.anchor !== "DUE") ctx.addIssue({ code: "custom", path: ["stages", index], message: `Stage ${index + 1}: "before" works only with the due time.` });
      if (stage.maxTimes > 1 && stage.repeatHours === null) ctx.addIssue({ code: "custom", path: ["stages", index], message: `Stage ${index + 1}: set how often it repeats.` });
    });
    rule.conditions.forEach((condition, index) => {
      if (!["EMPTY", "NOT_EMPTY"].includes(condition.op) && condition.value.trim() === "") ctx.addIssue({ code: "custom", path: ["conditions", index], message: `Condition ${index + 1}: enter a value.` });
    });
  });
export type RuleInput = z.infer<typeof ruleSchema>;

// What a new rule starts with in the editor.
export const NEW_RULE: RuleInput = {
  name: "",
  kind: "REMINDER",
  module: "APPROVAL",
  active: true,
  match: "ALL",
  conditions: [],
  stages: [{ anchor: "STARTED", offsetHours: 24, repeatHours: 24, maxTimes: 3, recipients: ["ASSIGNEE", "DELEGATE"], userIds: [] }],
  email: true,
  subject: "",
  body: "",
};

// The standard fields of each module; form fields join as "form.<key>".
export interface FieldOption {
  key: string;
  label: string;
  kind: "text" | "number";
}
export const STANDARD_FIELDS: Record<RuleModule, FieldOption[]> = {
  APPROVAL: [
    { key: "type", label: "Approval type", kind: "text" },
    { key: "request_no", label: "Request number", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "step", label: "Step name", kind: "text" },
    { key: "step_kind", label: "Step kind (APPROVAL or WORK)", kind: "text" },
    { key: "status", label: "Request status", kind: "text" },
    { key: "requester", label: "Requester", kind: "text" },
    { key: "requester_department", label: "Requester's department", kind: "text" },
    { key: "assignee", label: "Approver", kind: "text" },
    { key: "assignee_department", label: "Approver's department", kind: "text" },
    { key: "hours_pending", label: "Hours waiting at this step", kind: "number" },
    { key: "hours_since_raised", label: "Hours since raised", kind: "number" },
    { key: "hours_overdue", label: "Hours past the due time", kind: "number" },
  ],
  TASK: [
    { key: "type", label: "Task type", kind: "text" },
    { key: "task_no", label: "Task number", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "priority", label: "Priority (LOW, NORMAL, HIGH, URGENT)", kind: "text" },
    { key: "status", label: "Status (OPEN, IN_PROGRESS, BLOCKED)", kind: "text" },
    { key: "assignee", label: "Assignee", kind: "text" },
    { key: "assignee_department", label: "Assignee's department", kind: "text" },
    { key: "requester", label: "Created by", kind: "text" },
    { key: "requester_department", label: "Creator's department", kind: "text" },
    { key: "hours_pending", label: "Hours open", kind: "number" },
    { key: "hours_since_raised", label: "Hours since created", kind: "number" },
    { key: "hours_overdue", label: "Hours past the due date", kind: "number" },
  ],
};

export type RecordValues = Record<string, string | number | null | undefined>;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[,₹\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};
const asText = (value: unknown) => (value === null || value === undefined ? "" : String(value)).trim().toLowerCase();

// One condition against a record. Text compares ignore case; numbers compare
// as numbers when both sides are numbers.
export function conditionHolds(condition: Condition, record: RecordValues): boolean {
  const actual = record[condition.field];
  const empty = actual === null || actual === undefined || String(actual).trim() === "";
  if (condition.op === "EMPTY") return empty;
  if (condition.op === "NOT_EMPTY") return !empty;
  if (empty) return condition.op === "NE";
  const a = asNumber(actual);
  const b = asNumber(condition.value);
  const numeric = a !== null && b !== null;
  switch (condition.op) {
    case "EQ":
      return numeric ? a === b : asText(actual) === asText(condition.value);
    case "NE":
      return numeric ? a !== b : asText(actual) !== asText(condition.value);
    case "GT":
      return numeric && a > b;
    case "GE":
      return numeric && a >= b;
    case "LT":
      return numeric && a < b;
    case "LE":
      return numeric && a <= b;
    case "CONTAINS":
      return asText(actual).includes(asText(condition.value));
    case "IN":
      return condition.value
        .split(",")
        .map((item) => asText(item))
        .filter(Boolean)
        .includes(asText(actual));
  }
}

export function conditionsMatch(rule: Pick<RuleInput, "match" | "conditions">, record: RecordValues): boolean {
  if (!rule.conditions.length) return true;
  return rule.match === "ANY" ? rule.conditions.some((condition) => conditionHolds(condition, record)) : rule.conditions.every((condition) => conditionHolds(condition, record));
}

export interface Anchors {
  STARTED: Date;
  RAISED: Date;
  DUE: Date | null;
}

// Which send of a stage is due now: 1 = the first, 2 = the first repeat…
// null when nothing is due yet. Missed repeats are not sent one by one: only
// the latest due send counts, and a send already made is never repeated.
export function stageSendDue(stage: Stage, anchors: Anchors, now: Date): number | null {
  const anchor = anchors[stage.anchor];
  if (!anchor) return null;
  const first = anchor.getTime() + stage.offsetHours * 3_600_000;
  if (now.getTime() < first) return null;
  if (stage.maxTimes <= 1 || !stage.repeatHours) return 1;
  const repeats = Math.floor((now.getTime() - first) / (stage.repeatHours * 3_600_000));
  return Math.min(stage.maxTimes, 1 + repeats);
}

export const PLACEHOLDERS = ["ref", "title", "type", "step", "assignee", "requester", "due", "hours_pending", "hours_overdue", "link", "rule", "level"] as const;

export function renderTemplate(template: string, values: Partial<Record<(typeof PLACEHOLDERS)[number], string>>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => (key in values ? (values[key as keyof typeof values] ?? "") : match));
}

export const DEFAULT_TEXT: Record<RuleKind, { subject: string; body: string }> = {
  REMINDER: {
    subject: "Reminder: {{ref}} is waiting",
    body: "{{ref}} · {{title}} is waiting at {{step}} with {{assignee}} for {{hours_pending}} hours.\nDue: {{due}}\nOpen it: {{link}}",
  },
  ESCALATION: {
    subject: "Escalation (level {{level}}): {{ref}} is overdue",
    body: "{{ref}} · {{title}} has been waiting at {{step}} with {{assignee}} for {{hours_pending}} hours ({{hours_overdue}} hours past due).\nRequested by {{requester}}.\nPlease follow up: {{link}}",
  },
};

// A one-line description of a stage, for the rules list.
export function describeStage(stage: Stage): string {
  const hours = Math.abs(stage.offsetHours);
  const when = stage.offsetHours < 0 ? `${hours} h before ${ANCHOR_LABEL[stage.anchor]}` : hours === 0 ? `when ${ANCHOR_LABEL[stage.anchor]}` : `${hours} h after ${ANCHOR_LABEL[stage.anchor]}`;
  const repeat = stage.maxTimes > 1 && stage.repeatHours ? `, then every ${stage.repeatHours} h (up to ${stage.maxTimes} times)` : "";
  const who = [...stage.recipients.map((kind) => RECIPIENT_LABEL[kind].toLowerCase()), ...(stage.userIds.length ? [`${stage.userIds.length} named ${stage.userIds.length === 1 ? "person" : "people"}`] : [])].join(", ");
  return `${when}${repeat} → ${who}`;
}
