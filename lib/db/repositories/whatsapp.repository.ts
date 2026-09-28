import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";

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
