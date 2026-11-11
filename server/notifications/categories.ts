// v1.9.0 (owner, D-146): every notification belongs to a module: Approval,
// Task or Information (or System: sign-in, security and operations). Pure.
// New notifications store their category; older ones get it from their event
// type with the same lists, in SQL (CATEGORY_SQL), so both always agree.
// v1.51.1 (owner): Meeting is its own category in the Inbox.
export type NotificationCategory = "APPROVAL" | "TASK" | "MEETING" | "INFORMATION" | "SYSTEM";
export const CATEGORIES: readonly NotificationCategory[] = ["APPROVAL", "TASK", "MEETING", "INFORMATION", "SYSTEM"];
export const CATEGORY_LABEL: Record<NotificationCategory, string> = { APPROVAL: "Approval", TASK: "Task", MEETING: "Meeting", INFORMATION: "Information", SYSTEM: "System" };
// The address word for each view (/users/notifications?type=…).
export const CATEGORY_SLUG: Record<NotificationCategory, string> = { APPROVAL: "approvals", TASK: "tasks", MEETING: "meetings", INFORMATION: "information", SYSTEM: "system" };

// Task Management (not the approval engine's "work" steps, whose
// TASK_ASSIGNED belongs to the approval).
export const TASK_EVENTS: readonly string[] = [
  "WORK_TASK_ASSIGNED",
  "WORK_TASK_UPDATED",
  "WORK_TASK_COMMENT",
  "WORK_TASK_COMPLETED",
  "WORK_TASK_REOPENED",
  "WORK_TASK_CANCELLED",
  "WORK_TASK_DUE_SOON",
  "WORK_TASK_OVERDUE",
  // D-215: Task & Project Management.
  "WORK_TASK_MENTION",
  "WORK_PROJECT_MEMBER",
  "WORK_PROJECT_STATUS",
  "WORK_TASK_DIGEST", // D-218
];
// v1.51.0 (D-300), v1.51.1 (owner): Meeting Management, its own Inbox category.
export const MEETING_EVENTS: readonly string[] = ["MEETING_INVITED", "MEETING_UPDATED", "MEETING_CANCELLED", "MEETING_APPROVAL", "MEETING_DECIDED", "MEETING_PUBLISHED", "MEETING_REMINDER", "MEETING_ACTION"];
// D-252: IT's announcements and management notices sit with Information; its
// system notices and important alerts with System.
export const INFO_EVENTS: readonly string[] = ["INFO_PUBLISHED", "INFO_UPDATED", "INFO_WITHDRAWN", "INFO_ACK_REMINDER", "ADMIN_ANNOUNCEMENT", "ADMIN_MANAGEMENT"];
export const SYSTEM_EVENTS: readonly string[] = [
  "NEW_LOGIN",
  "ACCOUNT_LOCKED",
  "ACCOUNT_SECURED",
  "SECURITY_ALERT",
  "SUPER_ADMIN_SIGNIN",
  "BREAK_GLASS_USED",
  "PASSWORD_CHANGED",
  "WHATSAPP_CHANGED",
  "SIGN_IN_METHOD_CHANGED",
  "SET_PASSWORD_LINK",
  "USER_INVITED",
  "PASSWORD_RESET_LINK",
  "OTP_LOGIN",
  "OPS_ALERT",
  "EXPORT_READY",
  "ANALYTICS_ALERT",
  "PROVIDER_TEST",
  "ADMIN_SYSTEM",
  "ADMIN_IMPORTANT",
  "PUSH_TEST",
];

export function categoryOf(eventType: string): NotificationCategory {
  if (TASK_EVENTS.includes(eventType)) return "TASK";
  if (MEETING_EVENTS.includes(eventType)) return "MEETING";
  if (INFO_EVENTS.includes(eventType)) return "INFORMATION";
  if (SYSTEM_EVENTS.includes(eventType)) return "SYSTEM";
  return "APPROVAL";
}

const quoted = (list: readonly string[]) => list.map((event) => `'${event.replace(/[^A-Z_]/g, "")}'`).join(", ");
// The category of a notification row `n` (stored, or worked out for old rows).
export const CATEGORY_SQL = `COALESCE(n.category, CASE WHEN n.event_type IN (${quoted(TASK_EVENTS)}) THEN 'TASK' WHEN n.event_type IN (${quoted(MEETING_EVENTS)}) THEN 'MEETING' WHEN n.event_type IN (${quoted(INFO_EVENTS)}) THEN 'INFORMATION' WHEN n.event_type IN (${quoted(SYSTEM_EVENTS)}) THEN 'SYSTEM' ELSE 'APPROVAL' END)`;

export function parseCategory(value: unknown): NotificationCategory | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  const bySlug = (Object.entries(CATEGORY_SLUG) as [NotificationCategory, string][]).find(([, slug]) => slug === value.toLowerCase());
  if (bySlug) return bySlug[0];
  return (CATEGORIES as readonly string[]).includes(upper) ? (upper as NotificationCategory) : null;
}

// The record a notification is about, from its link when not given.
export type EntityRef = { type: "REQUEST" | "TASK" | "INFO" | "MEETING"; id: number };
export function entityFromLink(link: string | null | undefined): EntityRef | null {
  if (!link) return null;
  const path = link.replace(/^https?:\/\/[^/]+/, "");
  const patterns: [RegExp, EntityRef["type"]][] = [
    [/^\/users\/requests\/(\d+)/, "REQUEST"],
    [/^\/users\/tasks\/(\d+)/, "TASK"],
    [/^\/users\/information\/(\d+)/, "INFO"],
    [/^\/users\/meetings\/(\d+)/, "MEETING"],
  ];
  for (const [pattern, type] of patterns) {
    const match = pattern.exec(path);
    if (match) return { type, id: Number(match[1]) };
  }
  return null;
}

// A stored link (a full URL, for email) as an in-app path; only /users/
// pages, so a notification can never send someone off the site.
export function appPath(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link, "https://app.invalid");
    return url.pathname.startsWith("/users/") ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}
