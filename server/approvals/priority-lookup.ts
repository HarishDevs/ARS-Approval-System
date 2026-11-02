import "server-only";
import type { RowDataPacket } from "mysql2";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { rolesSeeConfidential } from "@/server/approvals/confidential";
import { requestPriorityFromJson, shownPriority, type RequestPriority, type ShownPriority } from "@/server/approvals/priority";

// v1.47.0: the priority of a page of requests in one query (lists, Home
// widgets, phone cards), like cardFacts does. A confidential priority is
// shown to the requester, IT and anyone who holds or decided a step on the
// request (QA-SEC-01, one more query only when some priority is confidential);
// others (collaborators, people who only viewed it) see "Hidden". Someone
// covering a pending step today sees it on the request page but "Hidden" in
// a list: the list errs on the side of hiding.
export async function requestPriorities(requestIds: readonly number[], viewer: { id: number; roles?: readonly string[] }, db: Queryable = getDbPool()): Promise<Map<number, ShownPriority>> {
  const out = new Map<number, ShownPriority>();
  const ids = [...new Set(requestIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  const [rows] = await db.query<(RowDataPacket & { id: number; requester_id: number; form_json: unknown; form_data_json: unknown })[]>(
    `SELECT r.id, r.requester_id, v.form_json, r.form_data_json
     FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id
     WHERE r.id IN (?)`,
    [ids],
  );
  const found = new Map<number, { requesterId: number; priority: RequestPriority }>();
  for (const row of rows) {
    const priority = requestPriorityFromJson(row.form_json, row.form_data_json);
    if (priority) found.set(row.id, { requesterId: row.requester_id, priority });
  }
  const admin = rolesSeeConfidential(viewer.roles ?? []);
  const secret = [...found].filter(([, item]) => item.priority.confidential && !admin && item.requesterId !== viewer.id).map(([id]) => id);
  const involved = new Set<number>();
  if (secret.length) {
    const [tasks] = await db.query<(RowDataPacket & { request_id: number })[]>(
      "SELECT DISTINCT request_id FROM approval_tasks WHERE request_id IN (?) AND (approver_id = ? OR decided_by = ?)",
      [secret, viewer.id, viewer.id],
    );
    for (const task of tasks) involved.add(task.request_id);
  }
  for (const [id, item] of found) {
    const shown = shownPriority(item.priority, admin || item.requesterId === viewer.id || involved.has(id));
    if (shown) out.set(id, shown);
  }
  return out;
}

// The same as a plain object, for passing to a page component.
export async function priorityRecord(requestIds: readonly number[], viewer: { id: number; roles?: readonly string[] }): Promise<Record<number, ShownPriority>> {
  return Object.fromEntries(await requestPriorities(requestIds, viewer).catch(() => new Map<number, ShownPriority>()));
}
