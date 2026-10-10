"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor } from "@/server/admin/actor";
import { applyImport, previewImport } from "@/server/workflows/promotion";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// FN9 import: check a file first (no changes), then import as a draft.
const MAX_BYTES = 512 * 1024;

async function readPackage(formData: FormData): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const file = formData.get("file");
  let text = typeof formData.get("json") === "string" ? String(formData.get("json")) : "";
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    if (file.size > MAX_BYTES) return { ok: false, message: "The file is too large for an approval type (over 512 KB)." };
    text = await file.text();
  }
  if (!text.trim()) return { ok: false, message: "Choose the exported file." };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: "That isn't a valid export file." };
  }
}

export async function previewImportAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return { ok: false, message: "Not found." };
  const read = await readPackage(formData);
  if (!read.ok) return { ok: false, message: read.message, fieldErrors: { file: read.message } };
  try {
    const preview = await previewImport(read.value);
    const pkg = read.value as { type?: { code?: string; name?: string }; version?: { versionNo?: number }; source?: string; exportedAt?: string };
    return {
      ok: preview.ok,
      message: preview.ok ? (preview.existing ? `Ready: this adds a new draft version to "${preview.existing.name}".` : `Ready: this creates the new approval type "${pkg.type?.name}" as a draft.`) : "The file can't be imported yet.",
      data: {
        preview: {
          problems: preview.problems,
          existing: preview.existing ? { id: preview.existing.id, name: preview.existing.name } : null,
          diff: preview.diff,
          settingsDiffer: preview.settingsDiffer,
          code: pkg.type?.code,
          name: pkg.type?.name,
          versionNo: pkg.version?.versionNo,
          source: pkg.source,
          exportedAt: pkg.exportedAt,
        },
        json: JSON.stringify(read.value),
      },
    };
  } catch (error) {
    logError("previewImportAction failed", error);
    return { ok: false, message: "Couldn't check the file. Please try again." };
  }
}

export async function applyImportAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return { ok: false, message: "Not found." };
  const read = await readPackage(formData);
  if (!read.ok) return { ok: false, message: read.message };
  try {
    const result = await applyImport(read.value, actor);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/admin/workflows");
    return { ok: true, message: result.created ? `Created as a draft (version 1). Check it and publish when ready.` : `Added as draft version ${result.versionNo}. Check it and publish when ready.`, data: { workflowId: result.workflowId } };
  } catch (error) {
    logError("applyImportAction failed", error);
    return { ok: false, message: "Couldn't import. Nothing was changed." };
  }
}
