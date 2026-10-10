import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import type { FormField } from "@/server/forms/fields";
import { addAttachments, filesFrom, prepareFiles, type PreparedFile } from "@/server/attachments/service";
import type { Actor } from "@/server/approvals/service";

// v1.6.1 attachment fields. The browser sends each field's files as
// `file:<key>`; the server checks them and puts the count in the field
// value itself, so a value sent by the browser is never trusted. Files
// already on the request in that field (resubmit) count too.
export const fileInputName = (key: string) => `file:${key}`;

export async function existingFieldCounts(requestId: number): Promise<Record<string, number>> {
  const [rows] = await getDbPool().query<(RowDataPacket & { field_key: string; n: number })[]>(
    "SELECT field_key, COUNT(*) AS n FROM request_attachments WHERE request_id = ? AND field_key IS NOT NULL GROUP BY field_key",
    [requestId],
  );
  return Object.fromEntries(rows.map((row) => [row.field_key, Number(row.n)]));
}

export async function prepareFieldFiles(
  formData: FormData,
  form: readonly FormField[],
  existing: Record<string, number> = {},
): Promise<{ ok: true; byField: Map<string, PreparedFile[]>; values: Record<string, string>; total: number } | { ok: false; field: string; message: string }> {
  const byField = new Map<string, PreparedFile[]>();
  const values: Record<string, string> = {};
  let total = 0;
  for (const field of form) {
    if (field.type !== "ATTACHMENT") continue;
    const prepared = await prepareFiles(filesFrom(formData, fileInputName(field.key)));
    if (!prepared.ok) return { ok: false, field: field.key, message: prepared.message };
    byField.set(field.key, prepared.files);
    total += prepared.files.length;
    values[field.key] = String(prepared.files.length + (existing[field.key] ?? 0));
  }
  return { ok: true, byField, values, total };
}

// For the readiness check: the counts the browser reports (no files sent).
// Only a preview; the submit counts the real files.
export function reportedFieldCounts(formData: FormData, form: readonly FormField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of form) {
    if (field.type !== "ATTACHMENT") continue;
    const raw = formData.get(`fileCount:${field.key}`);
    values[field.key] = typeof raw === "string" && /^\d{1,3}$/.test(raw) ? raw : "0";
  }
  return values;
}

// After the request exists: store each field's files against the field.
export async function saveFieldFiles(requestId: number, byField: Map<string, PreparedFile[]>, actor: Actor): Promise<boolean> {
  let ok = true;
  for (const [fieldKey, files] of byField) {
    if (!files.length) continue;
    const saved = await addAttachments(requestId, files, actor, { requesterOnly: true, fieldKey });
    if (!saved.ok) ok = false;
  }
  return ok;
}
