import "server-only";
import type { RowDataPacket } from "mysql2";
import { getDbPool } from "@/lib/db/client";
import { isConfidential, type FormField } from "@/server/forms/fields";
import { parseTypeSettings } from "@/server/workflows/type-settings";
import { formatPaise } from "@/server/forms/dynamic";

export interface CardFacts {
  department: string | null;
  amount: string | null;
  submittedAt: Date | null;
}

function json<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

// v1.43.0 (owner's mobile brief §4): the extra facts on a mobile approval
// card: the requester's department, when it was submitted, and the request's amount, if it has one.
// The amount is the type's budget amount field when budget checks are on,
// otherwise its first currency or line-items field. A confidential field is
// never shown on a card (the request page decides who sees it).
export async function cardFacts(requestIds: number[]): Promise<Map<number, CardFacts>> {
  const facts = new Map<number, CardFacts>();
  if (requestIds.length === 0) return facts;
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number; department: string | null; submitted_at: Date | null; form_json: unknown; form_data_json: unknown; settings_json: unknown })[]>(
    `SELECT r.id, d.name AS department, r.submitted_at, v.form_json, r.form_data_json, w.settings_json
     FROM approval_requests r
     JOIN users u ON u.id = r.requester_id
     LEFT JOIN departments d ON d.id = u.department_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     WHERE r.id IN (?)`,
    [requestIds],
  );
  for (const row of rows) {
    const form = json<FormField[]>(row.form_json) ?? [];
    const data = json<Record<string, unknown>>(row.form_data_json) ?? {};
    const settings = parseTypeSettings(row.settings_json);
    const money = form.filter((field) => (field.type === "CURRENCY" || field.type === "LINE_ITEMS") && !isConfidential(field));
    const field = (settings.budget.enabled ? money.find((item) => item.key === settings.budget.amountField) : undefined) ?? money[0];
    const value = field ? data[field.key] : undefined;
    facts.set(row.id, { department: row.department, amount: typeof value === "number" && Number.isFinite(value) ? formatPaise(Math.round(value * 100)) : null, submittedAt: row.submitted_at });
  }
  return facts;
}
