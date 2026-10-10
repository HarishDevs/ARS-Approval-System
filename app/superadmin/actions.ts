"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { createBackup, explainBackupError } from "@/server/ops/backup";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getEnv } from "@/config/environment";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// Super Admin → Back up now (D-104).
export async function backupNowAction(): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return { ok: false, message: "Not found." };
  }
  try {
    const report = await createBackup({ keepDays: getEnv().BACKUP_KEEP_DAYS ?? 14 });
    await recordAudit({ actorUserId: session.user.id, action: "BACKUP_CREATED", entityType: "SYSTEM", sessionId: session.sessionId, metadata: { tables: report.tables, rows: report.rows, bytes: report.bytes, attachmentsCopied: report.attachmentsCopied } });
    revalidatePath("/superadmin");
    return { ok: true, message: `Backed up ${report.tables} tables (${report.rows.toLocaleString("en-IN")} rows) and ${report.attachmentsCopied} new attachment file(s).` };
  } catch (error) {
    logError("backup now failed", error);
    return { ok: false, message: explainBackupError(error) };
  }
}
