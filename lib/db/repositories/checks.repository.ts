import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { Readiness } from "@/server/approvals/readiness";

// FN1/EN-09: what the server checked at submit, kept with the request.
export async function insertSubmissionCheck(requestId: number, readiness: Readiness, extra: { acknowledged: boolean; overrideReason: string | null }, db: Queryable = getDbPool()): Promise<void> {
  const budget = readiness.budget;
  await db.query(
    `INSERT INTO request_submission_checks (request_id, result_json, acknowledged, override_reason, budget_department, budget_fy, budget_paise, committed_paise, request_paise, budget_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      requestId,
      JSON.stringify({ status: readiness.status, items: readiness.items }),
      extra.acknowledged,
      extra.overrideReason,
      budget.departmentId,
      budget.fy,
      budget.budgetPaise,
      budget.committedPaise,
      budget.state === "NOT_CHECKED" ? null : budget.requestPaise,
      budget.state,
    ],
  );
}

export interface SubmissionCheck {
  status: string;
  items: { code: string; severity: string; message: string; field?: string }[];
  acknowledged: boolean;
  overrideReason: string | null;
  budget: { state: string; departmentId: number | null; fy: number | null; budgetPaise: number | null; committedPaise: number | null; requestPaise: number | null };
  createdAt: Date;
}

export async function findSubmissionCheck(requestId: number, db: Queryable = getDbPool()): Promise<SubmissionCheck | null> {
  const [rows] = await db.query<(RowDataPacket & { result_json: unknown; acknowledged: number; override_reason: string | null; budget_state: string; budget_department: number | null; budget_fy: number | null; budget_paise: number | null; committed_paise: number | null; request_paise: number | null; created_at: Date })[]>(
    "SELECT * FROM request_submission_checks WHERE request_id = ?",
    [requestId],
  );
  const row = rows[0];
  if (!row) return null;
  const result = (typeof row.result_json === "string" ? JSON.parse(row.result_json) : row.result_json) as { status: string; items: SubmissionCheck["items"] };
  return {
    status: result.status,
    items: result.items ?? [],
    acknowledged: Number(row.acknowledged) === 1,
    overrideReason: row.override_reason,
    budget: { state: row.budget_state, departmentId: row.budget_department, fy: row.budget_fy, budgetPaise: row.budget_paise === null ? null : Number(row.budget_paise), committedPaise: row.committed_paise === null ? null : Number(row.committed_paise), requestPaise: row.request_paise === null ? null : Number(row.request_paise) },
    createdAt: row.created_at,
  };
}

// A resubmit with a new amount moves the budget commitment with it.
export async function updateCommittedAmount(requestId: number, requestPaise: number | null, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE request_submission_checks SET request_paise = ? WHERE request_id = ? AND budget_state <> 'NOT_CHECKED'", [requestPaise, requestId]);
}
