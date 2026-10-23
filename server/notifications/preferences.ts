// Notification preferences (#6, D-110). Pure and unit-tested.
// Every message always lands in the in-app inbox. Email and WhatsApp can be
// switched off per group of events, except the groups that must reach the
// person: sign-in and account security, and work waiting for them.
export type Channel = "EMAIL" | "WHATSAPP";

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
    events: ["APPROVAL_NEEDED", "TASK_ASSIGNED", "REQUEST_BLOCKED", "WORK_TASK_ASSIGNED"],
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
    events: ["APPROVAL_DUE_SOON", "APPROVAL_REMINDER", "APPROVAL_ESCALATED"],
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
    help: "Changes, comments, completion, due-soon and overdue reminders on tasks you're part of.",
    mandatory: false,
    events: ["WORK_TASK_UPDATED", "WORK_TASK_COMMENT", "WORK_TASK_COMPLETED", "WORK_TASK_REOPENED", "WORK_TASK_CANCELLED", "WORK_TASK_DUE_SOON", "WORK_TASK_OVERDUE"],
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

export function mayOptOut(eventType: string): boolean {
  const group = groupOf(eventType);
  return Boolean(group && !group.mandatory);
}

// optedOut: the person's stored choices, as "GROUP:CHANNEL" strings.
export function channelWanted(eventType: string, channel: Channel, optedOut: ReadonlySet<string>): boolean {
  const group = groupOf(eventType);
  if (!group || group.mandatory) return true;
  return !optedOut.has(`${group.key}:${channel}`);
}
