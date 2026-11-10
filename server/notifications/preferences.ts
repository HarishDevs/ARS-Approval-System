// Notification preferences (#6, D-110). Pure and unit-tested.
// Every message always lands in the in-app inbox. Email and WhatsApp can be
// switched off per group of events, except the groups that must reach the
// person: sign-in and account security, and work waiting for them.
// D-231: INAPP is the alert in the app (bell and pop-up). A message switched
// off there is still kept under Notifications, already read.
// D-252: PUSH = phone and desktop notifications on the person's registered devices.
export type Channel = "EMAIL" | "WHATSAPP" | "INAPP" | "PUSH";
export const CHANNELS: readonly Channel[] = ["INAPP", "PUSH", "EMAIL", "WHATSAPP"];

export interface EventGroup {
  key: string;
  label: string;
  help: string;
  mandatory: boolean;
  events: readonly string[];
}

export const EVENT_GROUPS: readonly EventGroup[] = [
  {
    key: "SECURITY",
    label: "Sign-in and account security",
    help: "New sign-ins, locks, password and number changes. Always sent, so you can act at once.",
    mandatory: true,
    events: ["NEW_LOGIN", "ACCOUNT_LOCKED", "ACCOUNT_SECURED", "SECURITY_ALERT", "SUPER_ADMIN_SIGNIN", "BREAK_GLASS_USED", "PASSWORD_CHANGED", "WHATSAPP_CHANGED", "SIGN_IN_METHOD_CHANGED", "SET_PASSWORD_LINK", "USER_INVITED", "PASSWORD_RESET_LINK", "OTP_LOGIN"],
  },
  {
    key: "ACTION_NEEDED",
    label: "Work waiting for you",
    help: "An approval or a task is waiting for you, or a request is stuck and needs IT. Always sent, so nothing waits unnoticed.",
    mandatory: true,
    events: ["APPROVAL_NEEDED", "TASK_ASSIGNED", "REQUEST_BLOCKED", "WORK_TASK_ASSIGNED", "RULE_ESCALATION"],
  },
  {
    key: "MY_REQUESTS",
    label: "Updates on requests you raised",
    help: "Approved, rejected, changes asked, on hold, resumed, reopened, removed, moving again.",
    mandatory: false,
    events: ["REQUEST_APPROVED", "REQUEST_REJECTED", "CHANGES_REQUESTED", "REQUEST_ON_HOLD", "REQUEST_RESUMED", "REQUEST_REOPENED", "REQUEST_DELETED", "REQUEST_UNBLOCKED"],
  },
  {
    key: "REMINDERS",
    label: "Reminders and escalations",
    help: "Due soon, overdue reminders, and escalations to managers.",
    mandatory: false,
    events: ["APPROVAL_DUE_SOON", "APPROVAL_REMINDER", "APPROVAL_ESCALATED", "RULE_REMINDER"],
  },
  {
    key: "CONVERSATION",
    label: "Comments and mentions",
    help: "New comments on requests you're part of, and when someone mentions you.",
    mandatory: false,
    events: ["REQUEST_COMMENT", "REQUEST_MENTION"],
  },
  {
    key: "FYI",
    label: "For your information",
    help: "FYI steps, withdrawn requests, changes made after you asked, out-of-office changes.",
    mandatory: false,
    events: ["REQUEST_FYI", "REQUEST_WITHDRAWN", "REQUEST_RESUBMITTED", "DELEGATION_STARTED", "DELEGATION_ENDED"],
  },
  // v1.9.0: the Task and Information modules. The in-app notification is
  // always kept; these choices are about email and WhatsApp.
  {
    key: "TASK_UPDATES",
    label: "Task updates",
    help: "Changes, comments, mentions, completion, due-soon and overdue reminders on tasks you're part of; projects you're added to and their status updates.",
    mandatory: false,
    events: ["WORK_TASK_UPDATED", "WORK_TASK_COMMENT", "WORK_TASK_COMPLETED", "WORK_TASK_REOPENED", "WORK_TASK_CANCELLED", "WORK_TASK_DUE_SOON", "WORK_TASK_OVERDUE", "WORK_TASK_MENTION", "WORK_PROJECT_MEMBER", "WORK_PROJECT_STATUS", "WORK_TASK_DIGEST"],
  },
  // v1.51.0 (D-300): meetings. Invitations and approvals for the Meeting
  // Owner are not listed, so they are always sent.
  {
    key: "MEETINGS",
    label: "Meeting updates",
    help: "Changes and cancellations, approved points and MOM, answers from participants, deadline reminders and action follow-ups.",
    mandatory: false,
    events: ["MEETING_UPDATED", "MEETING_CANCELLED", "MEETING_DECIDED", "MEETING_PUBLISHED", "MEETING_REMINDER", "MEETING_ACTION"],
  },
  // D-252: notifications IT sends from Admin → Notifications.
  {
    key: "IMPORTANT",
    label: "Important alerts from IT",
    help: "Urgent notices from the IT team (for example a system outage or a safety alert). Always sent.",
    mandatory: true,
    events: ["ADMIN_IMPORTANT"],
  },
  {
    key: "ANNOUNCEMENTS",
    label: "Announcements from IT and management",
    help: "Announcements, management notices and system notices sent by the IT team.",
    mandatory: false,
    events: ["ADMIN_ANNOUNCEMENT", "ADMIN_MANAGEMENT", "ADMIN_SYSTEM"],
  },
  {
    key: "INFORMATION",
    label: "Information sent to you",
    help: "New information, updates, withdrawals and acknowledgement reminders.",
    mandatory: false,
    events: ["INFO_PUBLISHED", "INFO_UPDATED", "INFO_WITHDRAWN", "INFO_ACK_REMINDER"],
  },
];

const BY_EVENT = new Map(EVENT_GROUPS.flatMap((group) => group.events.map((event) => [event, group] as const)));

// Events not in a group are treated as mandatory: a new kind of message is
// never silently dropped because of an old preference.
export function groupOf(eventType: string): EventGroup | null {
  return BY_EVENT.get(eventType) ?? null;
}

// optedOut: the person's stored choices, as "GROUP:CHANNEL" strings, and
// (D-231) "E:EVENT:CHANNEL" for one kind of message.
export function channelWanted(eventType: string, channel: Channel, optedOut: ReadonlySet<string>): boolean {
  const group = groupOf(eventType);
  if (!group || group.mandatory) return true;
  return !optedOut.has(`${group.key}:${channel}`) && !optedOut.has(`E:${eventType}:${channel}`);
}

// D-231 (owner's screenshots of Asana's notification settings): each kind of
// message by name, so it can be switched on or off by itself.
export const EVENT_LABEL: Record<string, string> = {
  NEW_LOGIN: "A new sign-in to your account",
  ACCOUNT_LOCKED: "Your account is locked",
  ACCOUNT_SECURED: "Your account was secured",
  SECURITY_ALERT: "Security alerts",
  SUPER_ADMIN_SIGNIN: "Super Admin sign-ins",
  BREAK_GLASS_USED: "Break-glass account used",
  PASSWORD_CHANGED: "Your password changed",
  WHATSAPP_CHANGED: "Your WhatsApp number changed",
  SIGN_IN_METHOD_CHANGED: "How you sign in changed",
  SET_PASSWORD_LINK: "Set-password links",
  USER_INVITED: "Invitations",
  PASSWORD_RESET_LINK: "Password reset links",
  OTP_LOGIN: "Sign-in codes",
  APPROVAL_NEEDED: "An approval is waiting for you",
  TASK_ASSIGNED: "A task is given to you",
  REQUEST_BLOCKED: "A request is stuck and needs IT",
  WORK_TASK_ASSIGNED: "A task is assigned to you",
  RULE_ESCALATION: "An escalation rule reaches you",
  REQUEST_APPROVED: "Your request is approved",
  REQUEST_REJECTED: "Your request is rejected",
  CHANGES_REQUESTED: "Changes are asked on your request",
  REQUEST_ON_HOLD: "Your request is put on hold",
  REQUEST_RESUMED: "Your request moves again",
  REQUEST_REOPENED: "Your request is reopened",
  REQUEST_DELETED: "Your request is removed",
  REQUEST_UNBLOCKED: "Your request is unblocked",
  APPROVAL_DUE_SOON: "An approval is due soon",
  APPROVAL_REMINDER: "Overdue approval reminders",
  APPROVAL_ESCALATED: "An approval is escalated",
  RULE_REMINDER: "Reminder rules",
  REQUEST_COMMENT: "Comments on requests you're part of",
  REQUEST_MENTION: "Someone mentions you on a request",
  REQUEST_FYI: "FYI steps",
  REQUEST_WITHDRAWN: "A request is withdrawn",
  REQUEST_RESUBMITTED: "A request is changed and sent again",
  DELEGATION_STARTED: "Someone's out of office starts",
  DELEGATION_ENDED: "Someone's out of office ends",
  WORK_TASK_UPDATED: "A task's details change",
  WORK_TASK_COMMENT: "Comments on your tasks",
  WORK_TASK_COMPLETED: "A task is completed",
  WORK_TASK_REOPENED: "A task is reopened",
  WORK_TASK_CANCELLED: "A task is cancelled",
  WORK_TASK_DUE_SOON: "A task is due soon",
  WORK_TASK_OVERDUE: "A task is overdue",
  WORK_TASK_MENTION: "Someone mentions you on a task",
  WORK_PROJECT_MEMBER: "You're added to a project",
  WORK_PROJECT_STATUS: "Project status updates",
  WORK_TASK_DIGEST: "Morning summary of your tasks",
  MEETING_INVITED: "You're added to a meeting",
  MEETING_UPDATED: "A meeting changes",
  MEETING_CANCELLED: "A meeting is cancelled",
  MEETING_APPROVAL: "Meeting points or MOM to approve",
  MEETING_DECIDED: "Your meeting points or MOM are decided",
  MEETING_PUBLISHED: "Meeting points or MOM are ready",
  MEETING_REMINDER: "Meeting deadline reminders",
  MEETING_ACTION: "Meeting action follow-ups",
  INFO_PUBLISHED: "New information for you",
  INFO_UPDATED: "Information you got is updated",
  INFO_WITHDRAWN: "Information you got is withdrawn",
  INFO_ACK_REMINDER: "Reminders to acknowledge information",
  ADMIN_IMPORTANT: "Important alerts from IT",
  ADMIN_ANNOUNCEMENT: "Announcements",
  ADMIN_MANAGEMENT: "Management notices",
  ADMIN_SYSTEM: "System notices",
  PUSH_TEST: "Test notifications",
};
export const eventLabel = (eventType: string) => EVENT_LABEL[eventType] ?? eventType.toLowerCase().replace(/_/g, " ");

// Every key a person may switch off (groups and single kinds), per channel.
export function optionalKeys(): Set<string> {
  const out = new Set<string>();
  for (const group of EVENT_GROUPS.filter((item) => !item.mandatory)) {
    for (const channel of CHANNELS) {
      out.add(`${group.key}:${channel}`);
      for (const event of group.events) out.add(`E:${event}:${channel}`);
    }
  }
  return out;
}

// ---- Do not disturb (D-231) ---------------------------------------------------------------
// Paused until a time, a daily quiet time (from–to, India time, may cross
// midnight) and days off (0 = Sunday). While it holds, email and WhatsApp
// wait: nothing is sent, except sign-in and account security. The message is
// still in Notifications.
export const DND_SETTING = "notify.dnd";
export interface DoNotDisturb {
  pausedUntil: string | null; // ISO time
  quiet: { from: string; to: string } | null; // "HH:MM"
  daysOff: number[];
}
export const NO_DND: DoNotDisturb = { pausedUntil: null, quiet: null, daysOff: [] };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseDnd(raw: unknown): DoNotDisturb {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return NO_DND;
    }
  }
  if (!value || typeof value !== "object") return NO_DND;
  const record = value as Record<string, unknown>;
  const paused = typeof record.pausedUntil === "string" && !Number.isNaN(Date.parse(record.pausedUntil)) ? new Date(record.pausedUntil).toISOString() : null;
  const quietRaw = record.quiet as Record<string, unknown> | null | undefined;
  const quiet = quietRaw && typeof quietRaw.from === "string" && typeof quietRaw.to === "string" && HHMM.test(quietRaw.from) && HHMM.test(quietRaw.to) && quietRaw.from !== quietRaw.to ? { from: quietRaw.from, to: quietRaw.to } : null;
  const daysOff = Array.isArray(record.daysOff) ? [...new Set(record.daysOff.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort() : [];
  return { pausedUntil: paused, quiet, daysOff };
}

// India time (UTC+5:30) for the quiet hours and days off.
export function dndHolds(dnd: DoNotDisturb, now: Date): boolean {
  if (dnd.pausedUntil && Date.parse(dnd.pausedUntil) > now.getTime()) return true;
  const india = new Date(now.getTime() + 330 * 60_000);
  if (dnd.daysOff.includes(india.getUTCDay())) return true;
  if (!dnd.quiet) return false;
  const minutes = india.getUTCHours() * 60 + india.getUTCMinutes();
  const at = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
  const from = at(dnd.quiet.from);
  const to = at(dnd.quiet.to);
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

// Security messages go through Do not disturb (they need action at once).
export function dndApplies(eventType: string): boolean {
  return groupOf(eventType)?.key !== "SECURITY";
}
