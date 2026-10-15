"use server";

import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2/promise";
import { requireApiArea } from "@/server/authorization/guards";
import { getDbPool } from "@/lib/db/client";
import { listAccessRules, setAccessRule } from "@/lib/db/repositories/page-access.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { PAGE, type PageLevel } from "@/server/authorization/pages";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.8.0 (owner): page access is managed by the Super Admin only. Each change
// is checked (the page exists, the department or person exists, a landing
// page is never hidden) and audited with the level before and after.
const LEVELS = new Set(["FULL", "VIEW", "HIDDEN"]);

export async function setPageRuleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin", { change: true });
  } catch {
    return { ok: false, message: "Not found." };
  }
  const pageKey = String(formData.get("pageKey") ?? "");
  const scope = String(formData.get("scope") ?? "");
  const scopeId = scope === "EVERYONE" ? 0 : Number(formData.get("scopeId"));
  const raw = String(formData.get("level") ?? "");
  const level = raw === "" || formData.get("remove") === "1" ? null : (raw as PageLevel);
  const page = PAGE[pageKey];
  if (!page || !["EVERYONE", "DEPARTMENT", "USER"].includes(scope)) return { ok: false, message: "Not found." };
  if (scope !== "EVERYONE" && !(Number.isInteger(scopeId) && scopeId > 0)) return { ok: false, message: scope === "USER" ? "Choose a person." : "Choose a department.", fieldErrors: { scopeId: "Choose one." } };
  if (level !== null && !LEVELS.has(level)) return { ok: false, message: "Choose a level." };
  if (level === "HIDDEN" && page.neverHidden) return { ok: false, message: `${page.label} is the first page of its space: it can be view-only, not hidden.` };
  if (scope !== "EVERYONE") {
    const table = scope === "USER" ? "users" : "departments";
    const [rows] = await getDbPool().query<RowDataPacket[]>(`SELECT id FROM ${table} WHERE id = ?`, [scopeId]);
    if (!rows.length) return { ok: false, message: "Not found." };
  }
  try {
    const before = (await listAccessRules()).find((rule) => rule.pageKey === pageKey && rule.scope === scope && rule.scopeId === scopeId)?.level ?? null;
    await setAccessRule({ pageKey, scope: scope as "EVERYONE", scopeId, level, actorId: session.user.id });
    await recordAudit({ actorUserId: session.user.id, action: "PAGE_ACCESS_CHANGED", entityType: "PAGE", entityId: pageKey, sessionId: session.sessionId, metadata: { scope, scopeId, before, after: level } });
  } catch (error) {
    logError("setPageRuleAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/superadmin/pages", "layout");
  return { ok: true, message: level === null ? "Rule removed." : "Saved. It applies from the person's next page." };
}
