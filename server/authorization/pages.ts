// v1.8.0 (owner): every page of My approvals and the Admin space whose
// access the Super Admin can set (Hidden / View / Full) for everyone, a
// department or one person. Pure. Super Admin pages are never on this list:
// they stay the Super Admin's alone (D-039).
//
// `paths` are matched against the address (longest match wins); `apis` are
// the API routes that belong to the page, so its rule covers them too.
import type { ModuleCode } from "@/types/auth";

export type PageLevel = "HIDDEN" | "VIEW" | "FULL";
export const PAGE_LEVELS: readonly PageLevel[] = ["FULL", "VIEW", "HIDDEN"];
export const LEVEL_LABEL: Record<PageLevel, string> = { FULL: "Full: see and use", VIEW: "View only: no changes", HIDDEN: "Hidden" };

export interface PageDef {
  key: string;
  area: "users" | "admin";
  label: string;
  what: string; // what the page is, for the Super Admin
  paths: RegExp[];
  apis?: RegExp[];
  neverHidden?: boolean; // the landing page of a space can be view-only, not hidden
  // D-168 (AI module branch): the module the page belongs to. Without the
  // module the page, its actions and its APIs are refused like a hidden page.
  // No module: shared by every module (Overview, Calendar, Profile...).
  module?: ModuleCode;
  // v1.50.1 (owner: a task emailed to someone without the Task module
  // wouldn't open): the page still opens without the module; the page itself
  // then shows only records the person is on (server/modules/tasks.ts).
  partyOpen?: boolean;
}

const exact = (path: string) => new RegExp(`^${path.replace(/[/]/g, "\\/")}\\/?$`);
const under = (path: string) => new RegExp(`^${path.replace(/[/]/g, "\\/")}(\\/.*)?$`);

export const PAGES: readonly PageDef[] = [
  { key: "users.overview", area: "users", label: "Home", what: "The first page: what needs you, your requests, drafts, and (with Tasks) your tasks and projects.", paths: [exact("/users")], neverHidden: true },
  { key: "users.menu", area: "users", label: "Classic view menus", what: "The module menus of the Classic view (D-210).", paths: [under("/users/menu")], neverHidden: true },
  { key: "users.queue", module: "APPROVAL", area: "users", label: "Waiting for me", what: "Approvals and work waiting for the person; bulk approval.", paths: [under("/users/queue")] },
  { key: "users.requests", module: "APPROVAL", area: "users", label: "My requests", what: "The requests the person raised.", paths: [exact("/users/requests")] },
  { key: "users.request", module: "APPROVAL", area: "users", label: "Request page", what: "Opening a request: details, decisions, comments, files, PDF. View only = can read, not decide or comment.", paths: [/^\/users\/requests\/\d+(\/.*)?$/], apis: [/^\/api\/requests\/\d+\//, /^\/api\/attachments\//] },
  { key: "users.collaborating", module: "APPROVAL", area: "users", label: "Collaborating", what: "Requests the person was added to follow.", paths: [under("/users/collaborating")] },
  { key: "users.approved", module: "APPROVAL", area: "users", label: "My approved requests", what: "The person's requests that were approved.", paths: [under("/users/approved")] },
  { key: "users.approved_by_me", module: "APPROVAL", area: "users", label: "Approved by me", what: "Requests the person approved.", paths: [under("/users/approved-by-me")] },
  { key: "users.new", module: "APPROVAL", area: "users", label: "Request templates", what: "Raising a request from an approval type (template) set up by IT.", paths: [under("/users/new")] },
  { key: "users.custom", module: "APPROVAL", area: "users", label: "New request", what: "Raising a request with your own approvers (custom approval).", paths: [under("/users/custom")] },
  { key: "users.search", module: "APPROVAL", area: "users", label: "Search", what: "Searching requests (and the Ctrl K quick search).", paths: [under("/users/search")], apis: [/^\/api\/me\/quick/] },
  { key: "users.calendar", area: "users", label: "Calendar", what: "The needed-by calendar.", paths: [under("/users/calendar")] },
  { key: "users.analytics", area: "users", label: "Analytics (My approvals)", what: "Analytics for the person's own scopes.", paths: [under("/users/analytics")], apis: [/^\/api\/analytics\//] },
  // v1.9.0 (D-143): Task and Information modules.
  { key: "users.tasks", module: "TASK", area: "users", label: "Tasks: lists", what: "My tasks, Assigned by me and Team tasks.", paths: [exact("/users/tasks"), under("/users/tasks/assigned"), under("/users/tasks/team")] },
  { key: "users.task_new", module: "TASK", area: "users", label: "Tasks: new task", what: "Creating a task.", paths: [under("/users/tasks/new")] },
  { key: "users.task", module: "TASK", partyOpen: true, area: "users", label: "Tasks: task page", what: "Opening a task: details, progress, comments, files. View only = can read, not act.", paths: [/^\/users\/tasks\/\d+(\/.*)?$/] },
  // D-215: Task & Project Management.
  { key: "users.work", module: "TASK", area: "users", label: "Tasks: home, My Tasks, search", what: "Task home, My Tasks with its sections and board, task search and saved searches, deleted tasks.", paths: [exact("/users/work"), under("/users/work/my-tasks"), under("/users/work/search"), under("/users/work/deleted"), under("/users/work/inbox"), under("/users/work/periodic")] },
  { key: "users.projects", module: "TASK", area: "users", label: "Tasks: projects", what: "Projects: list, board, calendar, timeline, overview and status updates, members and settings.", paths: [under("/users/work/projects")] },
  // v1.51.0 (D-300): Meeting Management.
  { key: "users.meetings", module: "MEETING", area: "users", label: "Meetings: lists", what: "Meetings: upcoming, mine, to approve, past and all, and the follow-up register (actions and open points).", paths: [exact("/users/meetings"), under("/users/meetings/follow-ups")] },
  { key: "users.meeting_new", module: "MEETING", area: "users", label: "Meetings: schedule", what: "Scheduling a meeting or a follow-up meeting.", paths: [under("/users/meetings/new")] },
  { key: "users.meeting", module: "MEETING", partyOpen: true, area: "users", label: "Meetings: meeting page", what: "Opening a meeting: details, meeting points, attendance, MOM, action items, follow-ups. View only = can read, not act.", paths: [/^\/users\/meetings\/\d+(\/.*)?$/] },
  { key: "users.meeting_dashboard", module: "MEETING", area: "users", label: "Meetings: dashboard figures", what: "The figures on Home → Meetings: compliance (points and MOM on time, starts on time), attendance, actions, insights, by type and department, and the register. Hidden = Home shows only the person's own meetings and actions.", paths: [under("/users/meetings/dashboard")] },
  { key: "users.information", module: "INFORMATION", area: "users", label: "Information: lists", what: "The information inbox and information sent by the person.", paths: [exact("/users/information"), under("/users/information/sent")] },
  { key: "users.information_new", module: "INFORMATION", area: "users", label: "Information: new", what: "Writing and publishing information.", paths: [under("/users/information/new")] },
  { key: "users.information_item", module: "INFORMATION", area: "users", label: "Information: page", what: "Opening information: reading, acknowledging, withdrawing.", paths: [/^\/users\/information\/\d+(\/.*)?$/] },
  // D-168: the AI module. D-180 (owner): it is the assistant only; the old AI
  // pages (dashboard, intelligence, insights, sources, reports, history)
  // redirect to it, and sources, reports and history moved to Super Admin.
  { key: "users.ai_assistant", module: "AI", area: "users", label: "AI: assistant", what: "Asking the AI questions about the business.", paths: [under("/users/ai")], apis: [/^\/api\/ai\//] },
  { key: "users.help", area: "users", label: "Help", what: "How-tos and status meanings.", paths: [under("/users/help")] },
  { key: "users.profile", area: "users", label: "Profile", what: "Personal details and theme.", paths: [under("/users/profile")] },
  { key: "users.notifications", area: "users", label: "Inbox and notifications", what: "The Inbox (every notification, bookmarks, archive) and the notification settings.", paths: [under("/users/inbox"), under("/users/notifications")] },
  { key: "users.delegation", area: "users", label: "Out of office", what: "Naming a delegate while away.", paths: [under("/users/delegation")] },
  // SEC-17 (v1.10.0): "Sign-in & devices" is no longer on this list. It is a
  // person's own security control (signing out a lost device), so a page
  // rule must never hide it or make it view-only. Rules saved for it before
  // are ignored.
  { key: "admin.overview", area: "admin", label: "Admin overview", what: "The Admin space's first page.", paths: [exact("/admin")], neverHidden: true },
  { key: "admin.attention", area: "admin", label: "Needs attention", what: "Stuck requests and their fixes.", paths: [under("/admin/attention")] },
  { key: "admin.analytics", area: "admin", label: "Analytics (Admin)", what: "Organisation analytics.", paths: [under("/admin/analytics")] },
  { key: "admin.reports", area: "admin", label: "Reports", what: "Reports, downloads, schedules, alerts and exports.", paths: [under("/admin/reports"), under("/users/reports")], apis: [/^\/api\/reports\//, /^\/api\/exports\//] },
  { key: "admin.insights", area: "admin", label: "Insights", what: "Insight tiles.", paths: [under("/admin/insights")] },
  { key: "admin.dashboards", area: "admin", label: "Dashboards", what: "Utilisation, approvers, departments and raisers dashboards.", paths: [under("/admin/dashboards")], apis: [/^\/api\/admin\/dashboards\//] },
  { key: "admin.workload", area: "admin", label: "Workload", what: "Who has what waiting; moving pending tasks.", paths: [under("/admin/workload")] },
  { key: "admin.workflows", area: "admin", label: "Approval types & workflows", what: "Building and publishing approval types.", paths: [under("/admin/workflows")], apis: [/^\/api\/admin\/workflows\//] },
  { key: "admin.custom_approval", area: "admin", label: "Custom approval set-up", what: "The fields and step options of custom approvals.", paths: [under("/admin/custom-approval")] },
  { key: "admin.task_types", area: "admin", label: "Task types", what: "Setting up the kinds of task (forms, assignment, completion rules).", paths: [under("/admin/task-types")] },
  { key: "admin.task_holidays", area: "admin", label: "Task settings", what: "Task holidays (organisation and department), moving or telling about tasks due on a holiday, the morning summary, repeating tasks.", paths: [under("/admin/task-holidays")] },
  { key: "admin.meetings", area: "admin", label: "Meeting settings", what: "Meeting types (with their default points) and the Management group (ED, MD) who see every meeting.", paths: [under("/admin/meetings")] },
  { key: "admin.information_types", area: "admin", label: "Information types", what: "Setting up the kinds of information (forms, recipients, acknowledgement).", paths: [under("/admin/information-types")] },
  { key: "admin.groups", area: "admin", label: "Approver groups", what: "Groups of approvers.", paths: [under("/admin/groups")] },
  { key: "admin.doa", area: "admin", label: "Approval authority (DoA)", what: "Delegation of authority matrices.", paths: [under("/admin/doa")] },
  { key: "admin.budgets", area: "admin", label: "Budgets", what: "Department budgets.", paths: [under("/admin/budgets")] },
  { key: "admin.calendar", area: "admin", label: "Working calendar", what: "Working days and holidays.", paths: [under("/admin/calendar")] },
  { key: "admin.ai_analytics", area: "admin", label: "AI Analytics", what: "How Pico Bot is used: adoption, questions, speed, tokens and cost, by chat, provider, department and person.", paths: [under("/admin/ai-analytics")] },
  { key: "admin.reminders", area: "admin", label: "Reminders & escalations", what: "Rules that remind people and escalate late approvals and tasks.", paths: [under("/admin/reminders")] },
  { key: "admin.ai_rules", area: "admin", label: "AI Rules", what: "The rules every AI provider follows (company terms, where data is kept).", paths: [under("/admin/ai-rules")] },
  { key: "admin.records", area: "admin", label: "Records", what: "Every approval request, task and information item, with filters and a CSV download.", paths: [under("/admin/records")], apis: [/^\/api\/admin\/records\//] },
  { key: "admin.users", area: "admin", label: "Users & roles", what: "People, roles and hand-overs.", paths: [under("/admin/users")] },
  { key: "admin.organisation", area: "admin", label: "Departments", what: "Departments and designations.", paths: [under("/admin/organisation")] },
  { key: "admin.import", area: "admin", label: "Import data", what: "Bulk import of users and masters.", paths: [under("/admin/import")], apis: [/^\/api\/admin\/import\//] },
];

export const PAGE = Object.fromEntries(PAGES.map((page) => [page.key, page])) as Record<string, PageDef>;

// The page an address belongs to (null: not a configurable page).
export function pageForPath(path: string): PageDef | null {
  const clean = path.split("?")[0]!.split("#")[0]!;
  let best: { page: PageDef; length: number } | null = null;
  for (const page of PAGES) {
    for (const pattern of [...page.paths, ...(page.apis ?? [])]) {
      const match = pattern.exec(clean);
      if (match && (!best || match[0].length > best.length)) best = { page, length: match[0].length };
    }
  }
  return best?.page ?? null;
}

// V181-A7 (AUD-14, REC-06): addresses of My approvals and the Admin space
// that are deliberately not configurable pages, so they stay open to
// everyone with the area even when the person has page restrictions.
// "Sign-in & devices" is one (SEC-17: a personal security control). Any
// other address that is no configured page is refused for a restricted
// person (fail closed); tests/security/page-guards keeps this list complete.
export const OPEN_PATHS: readonly RegExp[] = [
  under("/users/security"), // SEC-17: signing out a lost device always works
  exact("/users/approvals"), // phone hub of the approval lists (each list keeps its own page rule)
  exact("/users/more"), // phone "More" menu (links already filtered by page access)
  under("/users/people"), // a person's contact card
  under("/admin/notifications"), // broadcast notifications (not yet a configurable page)
  exact("/users/no-access"), // v1.50.3: the "you don't have access" screen itself
  exact("/admin/no-access"),
];

// May a restricted person use an address that is no configured page?
// API routes keep their own rules (`apis` on a page, or `requireApiArea`'s
// `page` option); Super Admin addresses never (G-3); listed open addresses
// yes; anything else no.
export function isOpenAddress(path: string): boolean {
  const clean = path.split("?")[0]!.split("#")[0]!;
  if (/^\/superadmin(\/|$)/.test(clean)) return false;
  if (/^\/api\//.test(clean)) return true;
  return OPEN_PATHS.some((pattern) => pattern.test(clean));
}

// Most specific rule wins: the person, then their department, then everyone.
// No rule = Full. A landing page is never hidden (at most view-only).
export interface AccessRule {
  pageKey: string;
  scope: "EVERYONE" | "DEPARTMENT" | "USER";
  scopeId: number;
  level: PageLevel;
}

export function effectiveLevel(pageKey: string, rules: readonly AccessRule[], person: { id: number; departmentId: number | null }): PageLevel {
  const forPage = rules.filter((rule) => rule.pageKey === pageKey);
  const level =
    forPage.find((rule) => rule.scope === "USER" && rule.scopeId === person.id)?.level ??
    (person.departmentId !== null ? forPage.find((rule) => rule.scope === "DEPARTMENT" && rule.scopeId === person.departmentId)?.level : undefined) ??
    forPage.find((rule) => rule.scope === "EVERYONE")?.level ??
    "FULL";
  return level === "HIDDEN" && PAGE[pageKey]?.neverHidden ? "VIEW" : level;
}
