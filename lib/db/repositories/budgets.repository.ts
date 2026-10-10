import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// EN-09 department budgets per financial year. Committed = request amounts
// recorded at submit (request_submission_checks) for requests still open or
// approved; withdrawn, rejected and removed requests no longer count.
export interface BudgetRow {
  departmentId: number;
  departmentName: string;
  budgetPaise: number | null;
  warnPercent: number;
  committedPaise: number;
  requests: number;
  updatedAt: Date | null;
  updatedByName: string | null;
}

export async function listBudgets(fy: number, db: Queryable = getDbPool()): Promise<BudgetRow[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string; amount_paise: number | null; warn_percent: number | null; updated_at: Date | null; updated_by_name: string | null; committed: number; requests: number })[]>(
    `SELECT d.id, d.name, b.amount_paise, b.warn_percent, b.updated_at, u.name AS updated_by_name,
            (SELECT COALESCE(SUM(c.request_paise), 0) FROM request_submission_checks c JOIN approval_requests r ON r.id = c.request_id
              WHERE c.budget_department = d.id AND c.budget_fy = ? AND r.deleted_at IS NULL AND r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED', 'APPROVED')) AS committed,
            (SELECT COUNT(*) FROM request_submission_checks c JOIN approval_requests r ON r.id = c.request_id
              WHERE c.budget_department = d.id AND c.budget_fy = ? AND r.deleted_at IS NULL AND r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED', 'APPROVED')) AS requests
     FROM departments d
     LEFT JOIN budgets b ON b.department_id = d.id AND b.fy_start_year = ?
     LEFT JOIN users u ON u.id = b.updated_by
     WHERE d.active = TRUE OR b.id IS NOT NULL
     ORDER BY d.name`,
    [fy, fy, fy],
  );
  return rows.map((row) => ({
    departmentId: row.id,
    departmentName: row.name,
    budgetPaise: row.amount_paise === null ? null : Number(row.amount_paise),
    warnPercent: row.warn_percent ?? 90,
    committedPaise: Number(row.committed),
    requests: Number(row.requests),
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  }));
}

export async function findBudget(departmentId: number, fy: number, db: Queryable = getDbPool()): Promise<{ amountPaise: number; warnPercent: number } | null> {
  const [rows] = await db.query<(RowDataPacket & { amount_paise: number; warn_percent: number })[]>("SELECT amount_paise, warn_percent FROM budgets WHERE department_id = ? AND fy_start_year = ?", [departmentId, fy]);
  return rows[0] ? { amountPaise: Number(rows[0].amount_paise), warnPercent: Number(rows[0].warn_percent) } : null;
}

export async function saveBudget(input: { departmentId: number; fy: number; amountPaise: number; warnPercent: number; userId: number }, db: Queryable = getDbPool()): Promise<void> {
  await db.query(
    `INSERT INTO budgets (department_id, fy_start_year, amount_paise, warn_percent, updated_by) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE amount_paise = VALUES(amount_paise), warn_percent = VALUES(warn_percent), updated_by = VALUES(updated_by)`,
    [input.departmentId, input.fy, input.amountPaise, input.warnPercent, input.userId],
  );
}
