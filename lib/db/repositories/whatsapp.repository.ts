import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

export interface ActiveTemplate {
  id: number;
  providerName: string;
  language: string;
  variableKeys: string[];
}

interface TemplateRow extends RowDataPacket {
  id: number;
  provider_name: string;
  language: string;
}

interface VariableRow extends RowDataPacket {
  variable_key: string;
}

// Only a template that is ACTIVE, APPROVED by Meta and has a provider name
// is ever sent (Power BI site rule). Returns null otherwise.
export async function findActiveTemplate(eventType: string, language = "en"): Promise<ActiveTemplate | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<TemplateRow[]>(
    `SELECT id, provider_name, language FROM whatsapp_templates
     WHERE event_type = ? AND language = ? AND status = 'ACTIVE' AND approval_status = 'APPROVED'
       AND provider_name IS NOT NULL
     ORDER BY version DESC LIMIT 1`,
    [eventType, language],
  );
  const row = rows[0];
  if (!row) return null;
  const [variables] = await pool.query<VariableRow[]>(
    "SELECT variable_key FROM whatsapp_template_variables WHERE template_id = ? ORDER BY position",
    [row.id],
  );
  return { id: row.id, providerName: row.provider_name, language: row.language, variableKeys: variables.map((v) => v.variable_key) };
}

interface CountRow extends RowDataPacket {
  recent: number;
}

// MySQL-backed sliding window: prune old rows, count, then record.
export async function tryConsumeWhatsAppRateLimit(limitPerMinute: number): Promise<boolean> {
  const pool = getDbPool();
  await pool.query<ResultSetHeader>(
    "DELETE FROM whatsapp_rate_limit_log WHERE occurred_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 60 SECOND)",
  );
  const [rows] = await pool.query<CountRow[]>("SELECT COUNT(*) AS recent FROM whatsapp_rate_limit_log");
  if ((rows[0]?.recent ?? 0) >= limitPerMinute) return false;
  await pool.query<ResultSetHeader>("INSERT INTO whatsapp_rate_limit_log () VALUES ()");
  return true;
}

// ---- template registry (S6-04, F-42) -----------------------------------------------
export interface RegisteredTemplate {
  code: string;
  providerName: string | null;
  language: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  updatedAt: Date;
}

interface RegistryRow extends RowDataPacket {
  template_code: string;
  provider_name: string | null;
  language: string;
  status: RegisteredTemplate["status"];
  approval_status: RegisteredTemplate["approvalStatus"];
  updated_at: Date;
}

export async function listRegisteredTemplates(db: Queryable = getDbPool()): Promise<Map<string, RegisteredTemplate>> {
  const [rows] = await db.query<RegistryRow[]>(
    "SELECT template_code, provider_name, language, status, approval_status, updated_at FROM whatsapp_templates WHERE language = 'en' ORDER BY version",
  );
  const out = new Map<string, RegisteredTemplate>();
  for (const row of rows) {
    out.set(row.template_code, { code: row.template_code, providerName: row.provider_name, language: row.language, status: row.status, approvalStatus: row.approval_status, updatedAt: row.updated_at });
  }
  return out;
}

// Version 1, English. "on" = Meta approved and in use; off = kept as a draft.
// The variables are rewritten in catalogue order every time.
export async function saveRegisteredTemplate(
  input: { code: string; eventType: string; providerName: string | null; on: boolean; variables: readonly { key: string; label: string }[] },
  actorId: number,
  db: Queryable,
): Promise<void> {
  const status = input.on ? "ACTIVE" : "DRAFT";
  const approval = input.on ? "APPROVED" : "PENDING";
  await db.query<ResultSetHeader>(
    `INSERT INTO whatsapp_templates (template_code, event_type, provider_name, language, version, status, approval_status, created_by, updated_by)
     VALUES (?, ?, ?, 'en', 1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE event_type = VALUES(event_type), provider_name = VALUES(provider_name), status = VALUES(status),
       approval_status = VALUES(approval_status), updated_by = VALUES(updated_by)`,
    [input.code, input.eventType, input.providerName, status, approval, actorId, actorId],
  );
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM whatsapp_templates WHERE template_code = ? AND language = 'en' AND version = 1", [input.code]);
  const id = rows[0]?.id;
  if (!id) throw new Error("TEMPLATE_NOT_SAVED");
  await db.query<ResultSetHeader>("DELETE FROM whatsapp_template_variables WHERE template_id = ?", [id]);
  for (const [index, variable] of input.variables.entries()) {
    await db.query<ResultSetHeader>("INSERT INTO whatsapp_template_variables (template_id, position, variable_key, display_name) VALUES (?, ?, ?, ?)", [id, index + 1, variable.key, variable.label]);
  }
}
