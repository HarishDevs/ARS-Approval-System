import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { decideTask, type Actor } from "@/server/approvals/service";

// Bulk approval (#7, D-111). Each chosen item is approved on its own through
// decideTask: the same lock, version check, engine rules (who may decide,
// no self-approval, DoA levels), timeline, audit and messages as a single
// approval. One failure never affects the others. At most 25 at a time.
export const BULK_MAX = 25;

export interface BulkItem {
  requestId: number;
  taskKey: string;
}

export type BulkOutcome = { requestId: number; taskKey: string; requestNo: string | null; result: "APPROVED" | "SKIPPED" | "FAILED"; message: string };

// Only plain approval tasks of open requests qualify: work tasks, requests on
// hold or sent back, and anything not pending are left for one-by-one action.
async function eligibility(item: BulkItem): Promise<{ ok: true; requestNo: string } | { ok: false; requestNo: string | null; message: string }> {
  const [rows] = await getDbPool().query<(RowDataPacket & { request_no: string; status: string; task_status: string; task_type: string })[]>(
    `SELECT r.request_no, r.status, t.status AS task_status, t.task_type FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     WHERE t.request_id = ? AND t.task_key = ? AND r.deleted_at IS NULL ORDER BY t.id DESC LIMIT 1`,
    [item.requestId, item.taskKey],
  );
  const row = rows[0];
  if (!row) return { ok: false, requestNo: null, message: "Not found." };
  if (row.task_status !== "PENDING") return { ok: false, requestNo: row.request_no, message: "Already decided." };
  if (row.task_type !== "APPROVAL") return { ok: false, requestNo: row.request_no, message: "A work task: open it and mark it done." };
  if (row.status !== "IN_PROGRESS") return { ok: false, requestNo: row.request_no, message: row.status === "ON_HOLD" ? "On hold: resume it first." : "No longer waiting for approval." };
  return { ok: true, requestNo: row.request_no };
}

export async function bulkApprove(items: readonly BulkItem[], actor: Actor, comment?: string): Promise<BulkOutcome[]> {
  const unique = [...new Map(items.map((item) => [`${item.requestId}:${item.taskKey}`, item])).values()].slice(0, BULK_MAX);
  const outcomes: BulkOutcome[] = [];
  for (const item of unique) {
    const check = await eligibility(item);
    if (!check.ok) {
      outcomes.push({ ...item, requestNo: check.requestNo, result: "SKIPPED", message: check.message });
      continue;
    }
    try {
      const result = await decideTask({ requestId: item.requestId, taskKey: item.taskKey, decision: "APPROVE", comment }, actor);
      outcomes.push({ ...item, requestNo: check.requestNo, result: result.ok ? "APPROVED" : "FAILED", message: result.ok ? "Approved." : result.message });
    } catch {
      outcomes.push({ ...item, requestNo: check.requestNo, result: "FAILED", message: "Something went wrong with this one. Try it on its own." });
    }
  }
  return outcomes;
}
