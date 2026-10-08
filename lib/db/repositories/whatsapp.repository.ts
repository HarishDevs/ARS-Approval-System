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


// ---- template registry and creator (S6-04, S7, F-42b, D-076) -------------------------
// One row per version (English). A version is a draft until it's submitted;
// after that it's never edited again. The newest ACTIVE + APPROVED version
// is the one notify() sends (findActiveTemplate).
export interface TemplateVersion {
  id: number;
  code: string;
  eventType: string;
  version: number;
  providerName: string | null;
  category: string;
  body: string | null;
  footer: string | null;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  providerStatus: string | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
  syncedAt: Date | null;
  updatedAt: Date;
  variableKeys: string[];
}

interface VersionRow extends RowDataPacket {
  id: number;
  template_code: string;
  event_type: string;
  version: number;
  provider_name: string | null;
  category: string;
  body_text: string | null;
  footer_text: string | null;
  status: TemplateVersion["status"];
  approval_status: TemplateVersion["approvalStatus"];
  provider_status: string | null;
  rejection_reason: string | null;
  submitted_at: Date | null;
  synced_at: Date | null;
  updated_at: Date;
  variable_keys: string | null;
}

const VERSION_SELECT = `SELECT t.id, t.template_code, t.event_type, t.version, t.provider_name, t.category, t.body_text, t.footer_text, t.status,
    t.approval_status, t.provider_status, t.rejection_reason, t.submitted_at, t.synced_at, t.updated_at,
    (SELECT GROUP_CONCAT(v.variable_key ORDER BY v.position SEPARATOR ',') FROM whatsapp_template_variables v WHERE v.template_id = t.id) AS variable_keys
  FROM whatsapp_templates t WHERE t.language = 'en'`;

const toVersion = (row: VersionRow): TemplateVersion => ({
  id: row.id,
  code: row.template_code,
  eventType: row.event_type,
  version: row.version,
  providerName: row.provider_name,
  category: row.category,
  body: row.body_text,
  footer: row.footer_text,
  status: row.status,
  approvalStatus: row.approval_status,
  providerStatus: row.provider_status,
  rejectionReason: row.rejection_reason,
  submittedAt: row.submitted_at,
  syncedAt: row.synced_at,
  updatedAt: row.updated_at,
  variableKeys: row.variable_keys ? row.variable_keys.split(",") : [],
});

export async function listTemplateVersions(db: Queryable = getDbPool()): Promise<TemplateVersion[]> {
  const [rows] = await db.query<VersionRow[]>(`${VERSION_SELECT} ORDER BY t.template_code, t.version`);
  return rows.map(toVersion);
}

export async function versionsFor(code: string, db: Queryable = getDbPool()): Promise<TemplateVersion[]> {
  const [rows] = await db.query<VersionRow[]>(`${VERSION_SELECT} AND t.template_code = ? ORDER BY t.version`, [code]);
  return rows.map(toVersion);
}

// Another row (any event) already using this CEOITBox name.
export async function nameTakenElsewhere(providerName: string, exceptId: number | null, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT 1 FROM whatsapp_templates WHERE provider_name = ? AND language = 'en' AND id <> ? LIMIT 1", [providerName, exceptId ?? 0]);
  return rows.length > 0;
}

// Insert a new draft version, or update the draft in place (only while it
// hasn't been submitted). The variables are rewritten in position order.
export async function saveTemplateDraft(
  input: {
    existingId: number | null;
    code: string;
    eventType: string;
    version: number;
    providerName: string;
    category: string;
    body: string;
    footer: string | null;
    variables: readonly { key: string; label: string }[];
  },
  actorId: number,
  db: Queryable,
): Promise<number> {
  let id = input.existingId;
  if (id === null) {
    const [result] = await db.query<ResultSetHeader>(
      `INSERT INTO whatsapp_templates (template_code, event_type, provider_name, language, category, body_text, footer_text, version, status, approval_status, provider_status, created_by, updated_by)
       VALUES (?, ?, ?, 'en', ?, ?, ?, ?, 'DRAFT', 'PENDING', 'NOT_SUBMITTED', ?, ?)`,
      [input.code, input.eventType, input.providerName, input.category, input.body, input.footer, input.version, actorId, actorId],
    );
    id = result.insertId;
  } else {
    await db.query<ResultSetHeader>(
      `UPDATE whatsapp_templates SET provider_name = ?, category = ?, body_text = ?, footer_text = ?, updated_by = ?
       WHERE id = ? AND submitted_at IS NULL`,
      [input.providerName, input.category, input.body, input.footer, actorId, id],
    );
  }
  await db.query<ResultSetHeader>("DELETE FROM whatsapp_template_variables WHERE template_id = ?", [id]);
  for (const [index, variable] of input.variables.entries()) {
    await db.query<ResultSetHeader>("INSERT INTO whatsapp_template_variables (template_id, position, variable_key, display_name) VALUES (?, ?, ?, ?)", [id, index + 1, variable.key, variable.label]);
  }
  return id;
}

export async function markTemplateSubmitted(id: number, actorId: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>(
    "UPDATE whatsapp_templates SET provider_status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, submitted_by = ?, updated_by = ? WHERE id = ?",
    [actorId, actorId, id],
  );
}

// Meta's verdict from a sync. Approved: this version goes live and older
// live versions of the same event retire. Rejected or paused: it stops (or
// never starts) sending; an older approved version keeps working.
export async function applyTemplateVerdict(
  row: Pick<TemplateVersion, "id" | "code" | "version">,
  verdict: { outcome: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED"; metaStatus: string; reason: string | null },
  db: Queryable,
): Promise<void> {
  if (verdict.outcome === "APPROVED") {
    await db.query<ResultSetHeader>(
      "UPDATE whatsapp_templates SET status = 'ACTIVE', approval_status = 'APPROVED', provider_status = ?, rejection_reason = NULL, synced_at = CURRENT_TIMESTAMP WHERE id = ?",
      [verdict.metaStatus, row.id],
    );
    await db.query<ResultSetHeader>(
      "UPDATE whatsapp_templates SET status = 'RETIRED' WHERE template_code = ? AND language = 'en' AND version < ? AND status = 'ACTIVE'",
      [row.code, row.version],
    );
  } else if (verdict.outcome === "REJECTED") {
    await db.query<ResultSetHeader>(
      "UPDATE whatsapp_templates SET status = 'DRAFT', approval_status = 'REJECTED', provider_status = ?, rejection_reason = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?",
      [verdict.metaStatus, verdict.reason, row.id],
    );
  } else if (verdict.outcome === "PAUSED") {
    await db.query<ResultSetHeader>(
      "UPDATE whatsapp_templates SET status = 'DRAFT', provider_status = ?, rejection_reason = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?",
      [verdict.metaStatus, verdict.reason, row.id],
    );
  } else {
    await db.query<ResultSetHeader>("UPDATE whatsapp_templates SET provider_status = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?", [verdict.metaStatus, row.id]);
  }
}
