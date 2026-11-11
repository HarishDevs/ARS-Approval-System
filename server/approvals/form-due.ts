import "server-only";
import type { RowDataPacket } from "mysql2";
import { getDbPool, type Queryable } from "@/lib/db/client";

// v1.53.0 (owner: "due date is given but not reflecting"): a request's own
// due date is the value of its form's date field whose key or label says
// "due" (e.g. "Due date", key due_date). Waiting for me shows it in the Due
// date column; a step's own deadline (SLA) is shown under it as "Step due".
type Field = { key?: unknown; label?: unknown; type?: unknown; confidential?: unknown };
const json = <T>(value: unknown): T | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export function formDueDay(formJson: unknown, dataJson: unknown): string | null {
  const fields = json<Field[]>(formJson);
  const data = json<Record<string, unknown>>(dataJson);
  if (!Array.isArray(fields) || !data) return null;
  const field = fields.find(
    (item) => (item.type === "DATE" || item.type === "DATETIME") && item.confidential !== true && (/(^|_)due($|_)/i.test(String(item.key ?? "")) || /\bdue\b/i.test(String(item.label ?? ""))),
  );
  const value = field ? data[String(field.key)] : null;
  const day = typeof value === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] : null;
  return day ?? null;
}

// Each request's own due day (YYYY-MM-DD), for a page of requests in one query.
export async function formDueDays(requestIds: readonly number[], db: Queryable = getDbPool()): Promise<Record<number, string>> {
  const ids = [...new Set(requestIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return {};
  try {
    const [rows] = await db.query<(RowDataPacket & { id: number; form_json: unknown; form_data_json: unknown })[]>(
      "SELECT r.id, v.form_json, r.form_data_json FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id WHERE r.id IN (?)",
      [ids],
    );
    const out: Record<number, string> = {};
    for (const row of rows) {
      const day = formDueDay(row.form_json, row.form_data_json);
      if (day) out[row.id] = day;
    }
    return out;
  } catch {
    return {};
  }
}
