import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";

// Who may see which numbers (Addendum A role analytics, D-122). Checked on
// the server for every query; the page only offers the scopes returned here.
// - MINE: requests the person raised (everyone).
// - APPROVALS: tasks given to the person or decided by them.
// - TEAM: requests raised by the person's direct reports (reporting manager).
// - DEPARTMENT: requests raised by people in departments the person is HOD of.
// - ORGANISATION: everything (IT team and Super Admin).
// - TASKS (D-262, owner): the tasks given to the person (Task Management);
//   approval and information numbers don't apply to it.
export type ScopeKind = "MINE" | "APPROVALS" | "TASKS" | "TEAM" | "DEPARTMENT" | "ORGANISATION";

export interface Scope {
  kind: ScopeKind;
  label: string;
  departmentIds?: number[];
}

export interface Viewer {
  id: number;
  roles: readonly string[];
}

export const isAdmin = (viewer: Viewer) => viewer.roles.includes("IT_ADMIN") || viewer.roles.includes("SUPER_ADMIN");

export async function availableScopes(viewer: Viewer): Promise<Scope[]> {
  const db = getDbPool();
  const scopes: Scope[] = [{ kind: "MINE", label: "My requests" }];
  const [[tasks]] = await db.query<RowDataPacket[]>("SELECT EXISTS(SELECT 1 FROM approval_tasks WHERE approver_id = ? OR decided_by = ?) AS has_tasks", [viewer.id, viewer.id]);
  if (Number(tasks?.has_tasks)) scopes.push({ kind: "APPROVALS", label: "My approvals" });
  const [[work]] = await db.query<RowDataPacket[]>("SELECT EXISTS(SELECT 1 FROM tasks WHERE assignee_id = ? AND deleted_at IS NULL) AS has_work", [viewer.id]);
  if (Number(work?.has_work)) scopes.push({ kind: "TASKS", label: "My tasks" });
  const [[team]] = await db.query<RowDataPacket[]>("SELECT EXISTS(SELECT 1 FROM users WHERE reporting_manager_id = ? AND is_break_glass = FALSE) AS has_team", [viewer.id]);
  if (Number(team?.has_team)) scopes.push({ kind: "TEAM", label: "My team" });
  const [departments] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM departments WHERE hod_user_id = ? AND active = TRUE", [viewer.id]);
  if (departments.length) scopes.push({ kind: "DEPARTMENT", label: departments.length === 1 ? "My department" : "My departments", departmentIds: departments.map((row) => row.id) });
  if (isAdmin(viewer)) scopes.push({ kind: "ORGANISATION", label: "Whole organisation" });
  return scopes;
}

// The SQL condition on r (request) and rq (raiser) for a request-level scope.
export function requestScopeSql(scope: Scope, viewer: Viewer): { sql: string; params: unknown[] } {
  switch (scope.kind) {
    case "MINE":
      return { sql: "r.requester_id = ?", params: [viewer.id] };
    case "APPROVALS":
      return { sql: "EXISTS (SELECT 1 FROM approval_tasks st WHERE st.request_id = r.id AND (st.approver_id = ? OR st.decided_by = ?))", params: [viewer.id, viewer.id] };
    case "TEAM":
      return { sql: "rq.reporting_manager_id = ?", params: [viewer.id] };
    case "DEPARTMENT":
      return scope.departmentIds?.length ? { sql: "rq.department_id IN (?)", params: [scope.departmentIds] } : { sql: "FALSE", params: [] };
    case "ORGANISATION":
      return { sql: "TRUE", params: [] };
    case "TASKS":
      return { sql: "FALSE", params: [] };
  }
}

// The condition on t (task) for task-level numbers. In APPROVALS scope only
// the person's own tasks count; elsewhere every task on the scoped requests.
// For pending work, only the task holder counts (pendingOnly).
export function taskScopeSql(scope: Scope, viewer: Viewer, pendingOnly = false): { sql: string; params: unknown[] } {
  if (scope.kind === "APPROVALS") return pendingOnly ? { sql: "t.approver_id = ?", params: [viewer.id] } : { sql: "(t.approver_id = ? OR t.decided_by = ?)", params: [viewer.id, viewer.id] };
  return requestScopeSql(scope, viewer);
}

export async function resolveScope(kind: string | undefined, viewer: Viewer): Promise<{ scope: Scope; scopes: Scope[] }> {
  const scopes = await availableScopes(viewer);
  const fallback = scopes.find((scope) => scope.kind === "ORGANISATION") ?? scopes.find((scope) => scope.kind === "DEPARTMENT") ?? scopes.find((scope) => scope.kind === "APPROVALS") ?? scopes[0]!;
  return { scope: scopes.find((scope) => scope.kind === kind) ?? fallback, scopes };
}
