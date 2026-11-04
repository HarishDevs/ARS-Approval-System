"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor } from "@/server/admin/actor";
import { checkImport, readUpload, runImport } from "@/server/import/service";
import { isImportKind, type ImportKind } from "@/server/import/kinds";
import type { ImportPlan } from "@/server/import/plan";
import { logError } from "@/lib/logging/logger";

// Bulk import actions (S10, F-59). Used from both the Admin and the Super
// Admin space; each call re-checks the caller on the server. The browser
// gets the row results, never the planned writes.
export type ImportPreview = Omit<ImportPlan, "ops">;
export type ImportActionResult = { ok: boolean; message: string; preview?: ImportPreview };

const NOT_FOUND: ImportActionResult = { ok: false, message: "Not found." };

const REVALIDATE: Record<ImportKind, string[]> = {
  users: ["/admin/users", "/admin"],
  departments: ["/admin/organisation", "/admin"],
  designations: ["/admin/organisation"],
  groups: ["/admin/groups", "/admin"],
  holidays: ["/admin/calendar", "/admin"],
};

const preview = (plan: ImportPlan): ImportPreview => ({ kind: plan.kind, fileProblems: plan.fileProblems, rows: plan.rows, summary: plan.summary });

export async function checkImportAction(formData: FormData): Promise<ImportActionResult> {
  const actor = await getAdminActor("admin.import");
  if (!actor) return NOT_FOUND;
  const kind = formData.get("kind");
  if (!isImportKind(kind)) return { ok: false, message: "Choose what to import." };
  const upload = await readUpload(formData.get("file"));
  if (!upload.ok) return { ok: false, message: upload.message };
  try {
    const plan = await checkImport(kind, upload.text, actor);
    const fine = plan.fileProblems.length === 0 && plan.summary.error === 0;
    const toWrite = plan.summary.create + plan.summary.update;
    return {
      ok: fine,
      message: !fine
        ? plan.fileProblems.length
          ? "The file can't be read as it is."
          : `${plan.summary.error} of ${plan.summary.total} rows have problems. Nothing has been saved.`
        : toWrite === 0
          ? "Every row already matches. There is nothing to import."
          : "The file is fine. Review the changes, then import.",
      preview: preview(plan),
    };
  } catch (error) {
    logError("checkImportAction failed", error, { kind });
    return { ok: false, message: "Couldn't check the file. Please try again." };
  }
}

export async function runImportAction(formData: FormData): Promise<ImportActionResult> {
  const actor = await getAdminActor("admin.import");
  if (!actor) return NOT_FOUND;
  const kind = formData.get("kind");
  if (!isImportKind(kind)) return { ok: false, message: "Choose what to import." };
  const upload = await readUpload(formData.get("file"));
  if (!upload.ok) return { ok: false, message: upload.message };
  const outcome = await runImport(kind, upload.text, upload.name, actor);
  if (!outcome.ok) return { ok: false, message: outcome.message, preview: outcome.plan ? preview(outcome.plan) : undefined };
  for (const path of REVALIDATE[kind]) revalidatePath(path);
  const { create, update, unchanged } = outcome.plan.summary;
  return {
    ok: true,
    message: `Imported: ${create} created, ${update} updated${unchanged ? `, ${unchanged} already up to date` : ""}.${outcome.invited ? ` Welcome emails with a set-password link (valid 12 hours) are on their way to the ${outcome.invited} new ${outcome.invited === 1 ? "person" : "people"}.` : ""}`,
    preview: preview(outcome.plan),
  };
}
