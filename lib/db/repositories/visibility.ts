import { INDIA_TODAY_SQL } from "@/lib/db/repositories/directory.repository";

// Who may see a request (D-057), as one SQL condition shared by every list
// that shows requests: search, recently viewed, the command palette, the
// calendar. It matches the request page's check (loadRequestView):
//   the requester, anyone who holds or decided a task on it, the active
//   delegate of someone with a *pending* task on it, a consultee (v1.6.0),
//   or a collaborator the requester added (v1.6.1).
// IT and the Super Admin see everything, so callers skip the condition.
export function visibleToSql(alias = "r"): { sql: string; params: (userId: number) => unknown[] } {
  return {
    sql: `(${alias}.requester_id = ?
      OR EXISTS (SELECT 1 FROM approval_tasks vx WHERE vx.request_id = ${alias}.id AND (vx.approver_id = ? OR vx.decided_by = ?))
      OR EXISTS (SELECT 1 FROM approval_tasks vx JOIN delegations vd ON vd.user_id = vx.approver_id
                 WHERE vx.request_id = ${alias}.id AND vx.status = 'PENDING' AND vd.delegate_id = ? AND vd.ended_at IS NULL
                   AND ${INDIA_TODAY_SQL} BETWEEN vd.starts_on AND vd.ends_on)
      OR EXISTS (SELECT 1 FROM consultations vc WHERE vc.request_id = ${alias}.id AND vc.consultee_id = ?)
      OR EXISTS (SELECT 1 FROM request_collaborators vk WHERE vk.request_id = ${alias}.id AND vk.user_id = ? AND vk.removed_at IS NULL))`,
    params: (userId: number) => [userId, userId, userId, userId, userId, userId],
  };
}
