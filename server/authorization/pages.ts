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
}

const exact = (path: string) => new RegExp(`^${path.replace(/[/]/g, "\\/")}\\/?$`);
const under = (path: string) => new RegExp(`^${path.replace(/[/]/g, "\\/")}(\\/.*)?$`);

export const PAGES: readonly PageDef[] = [
  { key: "users.overview", area: "users", label: "Overview", what: "The first page: what needs you, your requests, drafts.", paths: [exact("/users")], neverHidden: true },
  { key: "users.queue", module: "APPROVAL", area: "users", label: "Waiting for me", what: "Approvals and work waiting for the person; bulk approval.", paths: [under("/users/queue")] },
  { key: "users.requests", module: "APPROVAL", area: "users", label: "My requests", what: "The requests the person raised.", paths: [exact("/users/requests")] },
  { key: "users.request", module: "APPROVAL", area: "users", label: "Request page", what: "Opening a request: details, decisions, comments, files, PDF. View only = can read, not decide or comment.", paths: [/^\/users\/requests\/\d+(\/.*)?$/], apis: [/^\/api\/requests\/\d+\//, /^\/api\/attachments\//] },
  { key: "users.collaborating", module: "APPROVAL", area: "users", label: "Collaborating", what: "Requests the person was added to follow.", paths: [under("/users/collaborating")] },
  { key: "users.approved", module: "APPROVAL", area: "users", label: "My approved requests", what: "The person's requests that were approved.", paths: [under("/users/approved")] },
  { key: "users.approved_by_me", module: "APPROVAL", area: "users", label: "Approved by me", what: "Requests the person approved.", paths: [under("/users/approved-by-me")] },
  { key: "users.new", module: "APPROVAL", area: "users", label: "New request", what: "Raising a request of an approval type.", paths: [under("/users/new")] },
  { key: "users.custom", module: "APPROVAL", area: "users", label: "Custom approval", what: "Raising a custom approval.", paths: [under("/users/custom")] },
  { key: "users.search", module: "APPROVAL", area: "users", label: "Search", what: "Searching requests (and the Ctrl K quick search).", paths: [under("/users/search")], apis: [/^\/api\/me\/quick/] },
  { key: "users.calendar", area: "users", label: "Calendar", what: "The needed-by calendar.", paths: [under("/users/calendar")] },
  { key: "users.analytics", area: "users", label: "Analytics (My approvals)", what: "Analytics for the person's own scopes.", paths: [under("/users/analytics")], apis: [/^\/api\/analytics\//] },
  // v1.9.0 (D-143): Task and Information modules.
  { key: "users.tasks", module: "TASK", area: "users", label: "Tasks: lists", what: "My tasks, Assigned by me and Team tasks.", paths: [exact("/users/tasks"), under("/users/tasks/assigned"), under("/users/tasks/team")] },
  { key: "users.task_new", module: "TASK", area: "users", label: "Tasks: new task", what: "Creating a task.", paths: [under("/users/tasks/new")] },
  { key: "users.task", module: "TASK", area: "users", label: "Tasks: task page", what: "Opening a task: details, progress, comments, files. View only = can read, not act.", paths: [/^\/users\/tasks\/\d+(\/.*)?$/] },
  { key: "users.information", module: "INFORMATION", area: "users", label: "Information: lists", what: "The information inbox and information sent by the person.", paths: [exact("/users/information"), under("/users/information/sent")] },
  { key: "users.information_new", module: "INFORMATION", area: "users", label: "Information: new", what: "Writing and publishing information.", paths: [under("/users/information/new")] },
  { key: "users.information_item", module: "INFORMATION", area: "users", label: "Information: page", what: "Opening information: reading, acknowledging, withdrawing.", paths: [/^\/users\/information\/\d+(\/.*)?$/] },
  // D-168 (AI module branch): the AI module's pages.
  { key: "users.ai_dashboard", module: "AI", area: "users", label: "AI: dashboard", what: "The AI dashboard.", paths: [exact("/users/ai")] },
  { key: "users.ai_assistant", module: "AI", area: "users", label: "AI: assistant", what: "Asking the AI questions about the business.", paths: [under("/users/ai/assistant")] },
  { key: "users.ai_intelligence", module: "AI", area: "users", label: "AI: business intelligence", what: "Governed comparisons, trends and reconciliations.", paths: [under("/users/ai/intelligence")] },
  { key: "users.ai_insights", module: "AI", area: "users", label: "AI: insights & recommendations", what: "Recommendations with evidence, and their approval.", paths: [under("/users/ai/insights")] },
  { key: "users.ai_sources", module: "AI", area: "users", label: "AI: data sources", what: "The connected sources and how fresh their data is.", paths: [under("/users/ai/data-sources")] },
  { key: "users.ai_reports", module: "AI", area: "users", label: "AI: reports", what: "AI reports.", paths: [under("/users/ai/reports")] },
  { key: "users.ai_history", module: "AI", area: "users", label: "AI: activity history", what: "The person's own AI conversations.", paths: [under("/users/ai/history")] },
  { key: "users.help", area: "users", label: "Help", what: "How-tos and status meanings.", paths: [under("/users/help")] },
  { key: "users.profile", area: "users", label: "Profile", what: "Personal details and theme.", paths: [under("/users/profile")] },
  { key: "users.notifications", area: "users", label: "Notifications", what: "The inbox and notification settings.", paths: [under("/users/notifications")] },
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
  { key: "admin.information_types", area: "admin", label: "Information types", what: "Setting up the kinds of information (forms, recipients, acknowledgement).", paths: [under("/admin/information-types")] },
  { key: "admin.groups", area: "admin", label: "Approver groups", what: "Groups of approvers.", paths: [under("/admin/groups")] },
  { key: "admin.doa", area: "admin", label: "Approval authority (DoA)", what: "Delegation of authority matrices.", paths: [under("/admin/doa")] },
  { key: "admin.budgets", area: "admin", label: "Budgets", what: "Department budgets.", paths: [under("/admin/budgets")] },
  { key: "admin.calendar", area: "admin", label: "Working calendar", what: "Working days and holidays.", paths: [under("/admin/calendar")] },
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
